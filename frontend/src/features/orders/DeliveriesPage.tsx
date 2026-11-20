import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, PageTitle, Modal, Field, Submit } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { posPermissions } from '../pos/pos-permissions'
type Delivery = {
  id: number
  order_id: number
  branch_id: number
  revision: number
  recipient_name: string
  phone: string
  address: string
  instructions: string | null
  courier_id: number | null
  courier_name: string | null
  status: 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled'
  preparation_status: string
  events: { id: number; status: string; reason: string | null; created_at: string }[]
}
const labels = {
  pending: 'Sin asignar',
  assigned: 'Repartidor asignado',
  out_for_delivery: 'En reparto',
  delivered: 'Entregado al cliente',
  cancelled: 'Cancelado',
}
export function DeliveriesPage() {
  const can = useCan()
  const context = useOperationContext()
  const [branch, setBranch] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [action, setAction] = useState<{ delivery: Delivery; status: string } | null>(null)
  const selected = branch ?? context.data?.branches.find((b) => b.is_active)?.id ?? null
  const query = useQuery({
    queryKey: ['deliveries', selected, status, page],
    enabled: !!selected,
    queryFn: () =>
      api<CatalogPage<Delivery>>(
        `deliveries?branch_id=${selected}&page=${page}${status ? '&status=' + status : ''}`,
      ),
    refetchInterval: 10000,
  })
  return (
    <section className="terminal-orders">
      <PageTitle
        eyebrow="ENTREGAS"
        title="Domicilios"
        description="Preparación y reparto con estados independientes del cobro."
        action={
          can('orders.manage') && (
            <Link
              className="button primary"
              to={
                posPermissions.every(can) ? '/pos?canal=delivery' : '/pedidos/nuevo?canal=delivery'
              }
            >
              Nuevo domicilio
            </Link>
          )
        }
      />
      <div className="operation-toolbar">
        <OperationalBranchPicker
          branches={context.data?.branches ?? []}
          value={selected}
          onChange={(id) => {
            setBranch(id)
            setPage(1)
          }}
        />
        <select
          className="order-state-filter"
          aria-label="Estado de domicilios"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(labels).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={query.error || context.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div className="terminal-order-list">
          {!query.data?.data.length && (
            <p className="notice">No hay domicilios para esta selección.</p>
          )}
          {query.data?.data.map((d) => (
            <article className="panel delivery-card" key={d.id}>
              <header>
                <strong>
                  Pedido #{d.order_id} · {d.recipient_name}
                </strong>
                <span className="pill">{labels[d.status]}</span>
              </header>
              <p>
                {d.address} · Tel. {d.phone}
              </p>
              {d.instructions && <p>{d.instructions}</p>}
              <p>
                Repartidor: {d.courier_name ?? 'Sin asignar'} · Cocina:{' '}
                {d.preparation_status === 'delivered'
                  ? 'Salida de cocina registrada'
                  : d.preparation_status === 'ready'
                    ? 'Listo'
                    : d.preparation_status === 'cancelled'
                      ? 'Cancelado'
                      : 'Pendiente de preparar'}
              </p>
              <div className="delivery-actions">
                <Link className="button secondary" to={`/pedidos/${d.order_id}`}>
                  Ver pedido
                </Link>
                {can('sales.collect') && (
                  <Link className="button secondary" to={`/pos/pedidos/${d.order_id}/cobrar`}>
                    Cobrar pedido
                  </Link>
                )}
                {can('orders.manage') && ['pending', 'assigned'].includes(d.status) && (
                  <button
                    className="button secondary"
                    onClick={() => setAction({ delivery: structuredClone(d), status: 'assigned' })}
                  >
                    Asignar repartidor
                  </button>
                )}
                {['assigned', 'out_for_delivery'].includes(d.status) && (
                  <button
                    className="button primary"
                    onClick={() =>
                      setAction({
                        delivery: structuredClone(d),
                        status: d.status === 'assigned' ? 'out_for_delivery' : 'delivered',
                      })
                    }
                  >
                    {d.status === 'assigned' ? 'Sale a reparto' : 'Confirmar entrega al cliente'}
                  </button>
                )}
              </div>
              <details>
                <summary>Historial de entrega</summary>
                {d.events.map((e) => (
                  <p key={e.id}>
                    {new Date(e.created_at).toLocaleString('es-CO')} ·{' '}
                    {labels[e.status as keyof typeof labels]}
                    {e.reason && ` · ${e.reason}`}
                  </p>
                ))}
              </details>
            </article>
          ))}
        </div>
      )}
      {query.data && (
        <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
      )}
      <small className="muted">
        Entregar un domicilio no registra un pago. El cobro se realiza sobre su pedido.
      </small>
      {action && <DeliveryAction value={action} onClose={() => setAction(null)} />}
    </section>
  )
}
function DeliveryAction({
  value,
  onClose,
}: {
  value: { delivery: Delivery; status: string }
  onClose: () => void
}) {
  const client = useQueryClient()
  const couriers = useQuery({
    queryKey: ['couriers', value.delivery.branch_id],
    enabled: value.status === 'assigned',
    queryFn: () =>
      api<{ data: { id: number; name: string }[] }>(
        `deliveries/couriers?branch_id=${value.delivery.branch_id}`,
      ),
  })
  const operation = useOperation(`deliveries/${value.delivery.id}/status`, async () => {
    await client.invalidateQueries({ queryKey: ['deliveries'] })
    onClose()
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    operation.send({
      revision: value.delivery.revision,
      status: value.status,
      ...(value.status === 'assigned' ? { courier_id: Number(f.get('courier_id')) } : {}),
      reason: f.get('reason') || null,
    })
  }
  return (
    <Modal
      title={
        value.status === 'assigned'
          ? 'Asignar repartidor'
          : value.status === 'out_for_delivery'
            ? 'Confirmar salida a reparto'
            : 'Confirmar entrega al cliente'
      }
      onClose={onClose}
      locked={operation.locked}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || couriers.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          {value.status === 'assigned' && (
            <Field label="Repartidor autorizado">
              <select name="courier_id" required defaultValue={value.delivery.courier_id ?? ''}>
                <option value="" disabled>
                  Selecciona un empleado
                </option>
                {couriers.data?.data.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Observación de entrega">
            <textarea name="reason" maxLength={250} />
          </Field>
        </fieldset>
        {operation.uncertain ? (
          <button type="button" className="button primary" onClick={() => operation.send({})}>
            Reintentar mismo cambio
          </button>
        ) : (
          <Submit pending={operation.isPending}>Confirmar estado de entrega</Submit>
        )}
      </form>
    </Modal>
  )
}
