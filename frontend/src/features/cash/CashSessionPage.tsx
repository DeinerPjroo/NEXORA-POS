import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, LockKeyhole } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { CashMovement, CashSession } from '../operations/types'
import { CashCommandModal } from './CashCommandModal'

export function CashSessionPage() {
  const { sessionId = '' } = useParams()
  const [page, setPage] = useState(1)
  const [command, setCommand] = useState<'income' | 'expense' | 'close' | null>(null)
  const can = useCan()
  const { session: identity } = useSession()
  const query = useQuery({
    queryKey: ['cash-session', sessionId],
    queryFn: ({ signal }) =>
      api<{ data: CashSession }>(`cash/sessions/${encodeURIComponent(sessionId)}`, { signal }),
  })
  const movements = useQuery({
    queryKey: ['cash-movements', sessionId, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<CashMovement>>(
        `cash/sessions/${encodeURIComponent(sessionId)}/movements?page=${page}&per_page=12`,
        { signal },
      ),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <CatalogError error={query.error} onRetry={() => void query.refetch()} />
  const session = query.data.data
  return (
    <>
      <Link className="text-button product-back" to="/caja">
        <ArrowLeft size={16} />
        Volver a caja
      </Link>
      <PageTitle
        eyebrow="EFECTIVO BAJO CONTROL"
        title={session.register_name ?? 'Sesión de caja'}
        description={`Sesión #${session.id} · ${session.status === 'open' ? 'Abierta' : 'Cerrada'} · ${session.currency}`}
        action={
          session.status === 'open' &&
          can('cash.manage') && (
            <button className="button secondary" onClick={() => setCommand('close')}>
              <LockKeyhole size={17} />
              Cerrar caja
            </button>
          )
        }
      />
      <div className="cash-session-metrics">
        <section className="panel">
          <span>Base de apertura</span>
          <strong>{formatMoney(session.opening_amount, session.currency)}</strong>
        </section>
        <section className="panel">
          <span>Efectivo esperado</span>
          <strong>{formatMoney(session.expected_amount, session.currency)}</strong>
        </section>
        <section className="panel">
          <span>Efectivo contado</span>
          <strong>
            {session.counted_amount !== null
              ? formatMoney(session.counted_amount, session.currency)
              : 'Pendiente de cierre'}
          </strong>
        </section>
        <section className="panel">
          <span>Diferencia de caja</span>
          <strong>
            {session.difference !== null ? formatMoney(session.difference, session.currency) : '—'}
          </strong>
        </section>
      </div>
      <section className="panel cash-ledger">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MOVIMIENTOS DE EFECTIVO</p>
            <h2>El recorrido de tu efectivo</h2>
          </div>
          {session.status === 'open' && can('cash.movements') && (
            <div className="operation-actions">
              <button className="button primary" onClick={() => setCommand('income')}>
                <ArrowDownLeft size={16} />
                Registrar ingreso
              </button>
              <button className="button secondary" onClick={() => setCommand('expense')}>
                <ArrowUpRight size={16} />
                Registrar egreso
              </button>
            </div>
          )}
        </div>
        <p className="muted operation-note">
          El esperado incluye apertura, movimientos manuales, cobros y devoluciones. Registrar o
          entregar un pedido por sí solo no mueve efectivo.
        </p>
        {movements.error ? (
          <CatalogError error={movements.error} onRetry={() => void movements.refetch()} />
        ) : movements.isPending ? (
          <div className="picker-loading">
            <Loading />
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>Motivo</th>
                    <th>Importe</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.data.map((movement) => (
                    <tr key={movement.id}>
                      <td>
                        <span
                          className={`pill ${movement.type === 'income' ? 'green' : 'neutral'}`}
                        >
                          {movement.type === 'income' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="movement-reason">{movement.reason}</td>
                      <td>
                        {formatMoney(
                          `${movement.type === 'expense' ? '-' : ''}${movement.amount}`,
                          session.currency,
                        )}
                      </td>
                      <td>
                        {new Intl.DateTimeFormat('es-CO', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: identity!.company.timezone,
                        }).format(new Date(movement.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!movements.data.data.length && (
              <p className="empty-inline muted">Aún no hay movimientos en esta sesión.</p>
            )}
            <Pagination
              meta={movements.data.meta}
              onPage={setPage}
              pending={movements.isFetching}
            />
          </>
        )}
      </section>
      {session.status === 'closed' && (
        <div className="info-strip">
          <LockKeyhole size={22} />
          <div>
            <h3>Cierre registrado. Los movimientos se conservan.</h3>
            <p>{session.closing_note || 'No se registró observación adicional.'}</p>
          </div>
        </div>
      )}
      {command && (
        <CashCommandModal
          mode={command}
          session={session}
          onClose={() => {
            setCommand(null)
            void query.refetch()
          }}
        />
      )}
    </>
  )
}
