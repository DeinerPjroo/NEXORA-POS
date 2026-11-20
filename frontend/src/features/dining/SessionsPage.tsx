import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, Modal, PageTitle } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { DiningSession } from './session-types'
import { SessionEditor } from './SessionEditor'
import { posPermissions } from '../pos/pos-permissions'
import './dining.css'

export function SessionsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('open')
  const query = useQuery({
    queryKey: ['dining-sessions', status, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<DiningSession>>('dining-sessions?status=' + status + '&page=' + page, {
        signal,
      }),
  })
  return (
    <>
      <Link className="text-button product-back" to="/salones">
        Volver a salones
      </Link>
      <PageTitle
        eyebrow="ATENCIÓN CON HISTORIA"
        title="Atenciones de mesas"
        description="Consulta las atenciones abiertas y cerradas de tu empresa."
      />
      <select
        aria-label="Estado de atenciones"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value)
          setPage(1)
        }}
      >
        <option value="open">Abiertas</option>
        <option value="closed">Cerradas</option>
      </select>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <section className="panel dining-layout">
          {query.data?.data.map((s) => (
            <p key={s.id}>
              <Link className="text-button" to={'/salones/atenciones/' + s.id}>
                Atención #{s.id}
              </Link>{' '}
              · {s.guest_count} personas · {s.waiter_name ?? 'Sin mesero'} ·{' '}
              {s.status === 'open' ? 'Abierta' : 'Cerrada'}
            </p>
          ))}
          {query.data?.data.length === 0 && <p>No hay atenciones en esta vista.</p>}
          {query.data && (
            <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
          )}
        </section>
      )}
    </>
  )
}
export function SessionDetailPage() {
  const { sessionId } = useParams()
  const can = useCan()
  const [editing, setEditing] = useState<DiningSession | null>(null)
  const [closing, setClosing] = useState<DiningSession | null>(null)
  const [transferring, setTransferring] = useState<{
    source: DiningSession
    order: NonNullable<DiningSession['orders']>[number]
  } | null>(null)
  const query = useQuery({
    queryKey: ['dining-session', sessionId],
    queryFn: ({ signal }) =>
      api<{ data: DiningSession }>('dining-sessions/' + sessionId, { signal }),
    refetchInterval: 15000,
  })
  if (query.isPending) return <Loading />
  if (!query.data) return <ErrorNotice error={query.error} />
  const s = query.data.data
  const labels: Record<string, string> = {
    opened: 'Atención abierta',
    updated: 'Mesas, personas o mesero actualizados',
    closed: 'Atención cerrada',
    'order.added': 'Pedido asociado',
    'order.items_added': 'Productos agregados al pedido',
    'order.transferred': 'Pedido trasladado',
  }
  return (
    <>
      <Link className="text-button product-back" to="/salones/atenciones">
        Volver a atenciones
      </Link>
      <PageTitle
        eyebrow={s.status === 'open' ? 'ATENCIÓN ABIERTA' : 'ATENCIÓN CERRADA'}
        title={'Atención #' + s.id}
        description={s.guest_count + ' personas · ' + (s.waiter_name ?? 'Sin mesero asignado')}
        action={
          <button className="button secondary" onClick={() => void query.refetch()}>
            Actualizar atención
          </button>
        }
      />
      <ErrorNotice error={query.error} />
      <section className="panel dining-layout">
        <h2>Mesas y servicio</h2>
        <p>
          {s.tables
            .filter((t) => !t.released_at)
            .map((t) => t.table_name)
            .join(' · ') || 'Todas las mesas liberadas'}
        </p>
        {s.notes && <p>{s.notes}</p>}
        {s.status === 'open' && can('dining.operate') && (
          <div className="form-actions">
            <button className="button secondary" onClick={() => setEditing(structuredClone(s))}>
              Unir, separar o asignar mesero
            </button>
            <button className="button secondary" onClick={() => setClosing(structuredClone(s))}>
              Cerrar atención
            </button>
            {posPermissions.filter((key) => key !== 'sales.collect').every(can) &&
              can('dining.view') && (
                <Link className="button primary" to={'/pos/atenciones/' + s.id}>
                  Tomar pedido en POS
                </Link>
              )}
          </div>
        )}
      </section>
      {can('orders.view') && (
        <section className="panel dining-layout">
          <h2>Pedidos de esta atención</h2>
          <p className="muted">
            Hasta los 100 pedidos de la atención. El cierre exige cobrar o cancelar los pendientes.
          </p>
          {!s.orders?.length && <p>Esta atención aún no tiene pedidos.</p>}
          {s.orders?.map((o) => (
            <div className="dining-session-order" key={o.id}>
              <Link className="text-button" to={'/pedidos/' + o.id}>
                Pedido #{o.id}
              </Link>
              <span>
                {o.status === 'cancelled'
                  ? 'Cancelado'
                  : o.sale_id
                    ? 'Venta registrada'
                    : 'Sin venta'}
              </span>
              {s.status === 'open' &&
                !o.sale_id &&
                o.status !== 'cancelled' &&
                can('dining.operate') &&
                can('orders.manage') && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      setTransferring({ source: structuredClone(s), order: structuredClone(o) })
                    }
                  >
                    Trasladar pedido #{o.id}
                  </button>
                )}
            </div>
          ))}
        </section>
      )}
      <section className="panel dining-layout">
        <h2>Actividad reciente</h2>
        <p className="muted">Últimos 50 eventos. Los registros anteriores se conservan.</p>
        {s.events?.map((e) => (
          <p key={e.id}>
            {labels[e.action] ?? e.action} · {new Date(e.created_at).toLocaleString('es-CO')}
          </p>
        ))}
      </section>
      {editing && (
        <SessionEditor branchId={s.branch_id} session={editing} onClose={() => setEditing(null)} />
      )}
      {closing && <CloseSession session={closing} onClose={() => setClosing(null)} />}
      {transferring && (
        <TransferEditor
          source={transferring.source}
          order={transferring.order}
          onClose={() => setTransferring(null)}
        />
      )}
    </>
  )
}
function CloseSession({ session, onClose }: { session: DiningSession; onClose: () => void }) {
  const client = useQueryClient()
  const operation = useOperation<DiningSession>(
    'dining-sessions/' + session.id + '/close',
    async () => {
      await Promise.all(
        ['dining-session', 'dining-sessions', 'dining-occupancy', 'dining-available'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      onClose()
    },
  )
  return (
    <Modal
      title="Cerrar atención"
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <p>
        Se liberarán las mesas. Los pedidos deben estar cobrados o cancelados; un abono con saldo
        pendiente impide el cierre.
      </p>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="form-actions">
        <button className="button secondary" disabled={operation.locked} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={operation.isPending}
          onClick={() => operation.send({ revision: session.revision })}
        >
          {operation.uncertain ? 'Reintentar mismo cierre' : 'Confirmar cierre'}
        </button>
      </div>
    </Modal>
  )
}
function TransferEditor({
  source: initialSource,
  order: initialOrder,
  onClose,
}: {
  source: DiningSession
  order: NonNullable<DiningSession['orders']>[number]
  onClose: () => void
}) {
  const [source] = useState(initialSource)
  const [order] = useState(initialOrder)
  const [target, setTarget] = useState<DiningSession | null>(null)
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['dining-sessions', 'transfer', source.branch_id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<DiningSession>>(
        'dining-sessions?status=open&per_page=50&branch_id=' + source.branch_id + '&page=' + page,
        { signal },
      ),
  })
  const operation = useOperation('orders/' + order.id + '/dining-transfer', async () => {
    await Promise.all(
      ['dining-session', 'dining-sessions', 'orders', 'order'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    onClose()
  })
  return (
    <Modal
      title={'Trasladar pedido #' + order.id}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <p>
        Elige otra atención abierta de esta sucursal. Los importes y la ubicación inicial del pedido
        se conservan.
      </p>
      <ErrorNotice error={operation.error || query.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <fieldset disabled={operation.locked}>
        <label>
          Atención de destino
          <select
            aria-label="Atención de destino"
            value={target?.id ?? ''}
            onChange={(e) =>
              setTarget(
                structuredClone(
                  query.data?.data.find((s) => s.id === Number(e.target.value)) ?? null,
                ),
              )
            }
          >
            <option value="">Selecciona una atención</option>
            {query.data?.data
              .filter((s) => s.id !== source.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  Atención #{s.id} ·{' '}
                  {s.tables
                    .filter((t) => !t.released_at)
                    .map((t) => t.table_name)
                    .join(', ')}
                </option>
              ))}
          </select>
        </label>
        {query.data && (
          <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
        )}
      </fieldset>
      <div className="form-actions">
        <button className="button secondary" disabled={operation.locked} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={operation.isPending || (!target && !operation.uncertain)}
          onClick={() =>
            operation.send(
              target
                ? {
                    order_revision: order.revision,
                    source_revision: source.revision,
                    target_session_id: target.id,
                    target_revision: target.revision,
                  }
                : {},
            )
          }
        >
          {operation.uncertain ? 'Reintentar mismo traslado' : 'Confirmar traslado'}
        </button>
      </div>
    </Modal>
  )
}
