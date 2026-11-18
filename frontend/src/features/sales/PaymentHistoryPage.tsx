import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { saleStates } from './types'
import type { HistoryPage, PaymentEntry } from './payment-history-types'
import { reviewStates } from './payment-history-types'
import { ManualReviewModal, PaymentReviewsModal } from './PaymentReviewModals'

const emptyFilters = { branch: '', kind: '', reference: '', from: '', to: '', review: '' }

export function PaymentHistoryPage() {
  const [draft, setDraft] = useState(emptyFilters)
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [reviewing, setReviewing] = useState<PaymentEntry | null>(null)
  const [history, setHistory] = useState<PaymentEntry | null>(null)
  const context = useOperationContext()
  const { session } = useSession()
  const can = useCan()
  const params = new URLSearchParams({ page: String(page), per_page: '12' })
  for (const [key, value] of Object.entries({
    branch_id: filters.branch,
    method_kind: filters.kind,
    reference: filters.reference,
    from: filters.from,
    to: filters.to,
    review_status: filters.review,
  }))
    if (value) params.set(key, value)
  const query = useQuery({
    queryKey: ['payment-history', params.toString()],
    queryFn: ({ signal }) => api<HistoryPage>(`finance/payments?${params}`, { signal }),
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const timezone = query.data?.timezone ?? session!.company.timezone
  const date = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value))
  function apply(event: FormEvent) {
    event.preventDefault()
    setFilters({ ...draft })
    setPage(1)
  }
  return (
    <>
      <Link className="text-button product-back" to="/ventas">
        Volver a ventas
      </Link>
      <PageTitle
        eyebrow="CADA PAGO, CON SU RECORRIDO"
        title="Historial de pagos"
        description="Consulta importes aplicados, devoluciones acumuladas y netos por pago, con sus métodos y referencias originales."
      />
      <ErrorNotice error={context.error} />
      <form className="panel form-stack payment-history-filters" onSubmit={apply}>
        <div className="form-grid">
          <Field label="Sucursal del historial">
            <select
              value={draft.branch}
              onChange={(event) => setDraft({ ...draft, branch: event.target.value })}
            >
              <option value="">Todas las sucursales</option>
              {context.data?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.is_active ? '' : ' · Inactiva'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de método">
            <select
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
            >
              <option value="">Todos los métodos</option>
              <option value="cash">Efectivo</option>
              <option value="non_cash">No efectivo · Manual</option>
            </select>
          </Field>
          <Field label="Desde la fecha">
            <input
              type="date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </Field>
          <Field label="Hasta la fecha">
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </Field>
          <Field label="Buscar referencia del pago">
            <input
              maxLength={120}
              value={draft.reference}
              onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
            />
          </Field>
          <Field label="Estado de revisión manual">
            <select
              value={draft.review}
              onChange={(event) => setDraft({ ...draft, review: event.target.value })}
            >
              <option value="">Todos los estados</option>
              {(['pending', 'matched', 'difference', 'stale'] as const).map((status) => (
                <option value={status} key={status}>
                  {reviewStates[status]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="muted small">
          Fechas de registro del pago en {timezone}. Las devoluciones corresponden al acumulado
          actual de esos pagos.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setDraft(emptyFilters)
              setFilters(emptyFilters)
              setPage(1)
            }}
          >
            Limpiar filtros
          </button>
          <button className="button primary" type="submit" disabled={query.isFetching}>
            {query.isFetching ? 'Consultando…' : 'Aplicar filtros'}
          </button>
        </div>
        {JSON.stringify(draft) !== JSON.stringify(filters) && (
          <p className="muted small">Aplica los filtros para actualizar la lista.</p>
        )}
      </form>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <section className="panel payment-history-summary" aria-label="Resumen de esta página">
            <h2>Resumen de esta página</h2>
            <p className="muted small">Suma de los pagos visibles, agrupada por moneda.</p>
            {query.isFetching && (
              <p role="status" className="muted">
                Actualizando pagos…
              </p>
            )}
            {query.data.summary.map((summary) => (
              <div className="sale-account-card" key={summary.currency}>
                <h3>
                  {summary.currency} · {summary.count} {summary.count === 1 ? 'pago' : 'pagos'}
                </h3>
                <dl className="sale-amounts">
                  <div>
                    <dt>Aplicado</dt>
                    <dd>{formatMoney(summary.applied_amount, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Devuelto acumulado</dt>
                    <dd>{formatMoney(summary.refunded_amount, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Neto conservado</dt>
                    <dd>{formatMoney(summary.net_paid_amount, summary.currency)}</dd>
                  </div>
                </dl>
              </div>
            ))}
            {!query.data.summary.length && <p>No hay pagos en esta página.</p>}
          </section>
          <section
            className="panel sales-list-panel payment-history-results"
            aria-label="Pagos registrados"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pago y recibo</th>
                    <th>Registrado</th>
                    <th>Método y referencia</th>
                    <th>Aplicado</th>
                    <th>Devuelto acumulado</th>
                    <th>Neto</th>
                    <th>Revisión manual</th>
                    <th>Consultar</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>Pago #{entry.id}</strong>
                        <small className="sale-order-id">
                          {entry.receipt_code} · {saleStates[entry.sale_status]}
                        </small>
                        <small className="sale-order-id">
                          {entry.branch_name}
                          {entry.account_label ? ` · ${entry.account_label}` : ''}
                        </small>
                      </td>
                      <td>
                        {date(entry.created_at)}
                        <small className="sale-order-id">
                          {can('cash.view') ? (
                            <Link
                              className="text-button"
                              to={`/caja/sesiones/${entry.cash_session_id}`}
                            >
                              Sesión #{entry.cash_session_id}
                            </Link>
                          ) : (
                            `Sesión #${entry.cash_session_id}`
                          )}
                        </small>
                      </td>
                      <td>
                        <strong>{entry.method_name}</strong>
                        <small className="sale-order-id">
                          {entry.method_kind === 'cash'
                            ? 'Efectivo · Registro del operador'
                            : 'Manual no efectivo'}
                        </small>
                        {entry.reference && (
                          <small className="sale-order-id">{entry.reference}</small>
                        )}
                      </td>
                      <td>{formatMoney(entry.applied_amount, entry.currency)}</td>
                      <td>
                        {formatMoney(entry.refunded_amount, entry.currency)}
                        {!!entry.refunds_count && (
                          <small className="sale-order-id">
                            {entry.refunds_count}{' '}
                            {entry.refunds_count === 1 ? 'devolución' : 'devoluciones'}
                          </small>
                        )}
                      </td>
                      <td>
                        <strong>{formatMoney(entry.net_paid_amount, entry.currency)}</strong>
                      </td>
                      <td>
                        <span className={`payment-review-state ${entry.review_status}`}>
                          {reviewStates[entry.review_status]}
                        </span>
                        {entry.latest_review && (
                          <small className="sale-order-id">
                            {entry.latest_review.actor_name} ·{' '}
                            {date(entry.latest_review.created_at)}
                          </small>
                        )}
                        {entry.method_kind === 'non_cash' && (
                          <div className="payment-review-actions">
                            {!!entry.review_revision && (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setHistory(entry)}
                              >
                                Ver revisiones
                              </button>
                            )}
                            {can('sales.reconcile') && (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setReviewing(entry)}
                              >
                                Registrar revisión
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link className="text-button" to={`/ventas/${entry.sale_id}`}>
                          Ver recibo
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.data.data.length && (
              <p className="empty-inline muted">No hay pagos con estos filtros.</p>
            )}
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          </section>
        </>
      )}
      {reviewing && <ManualReviewModal entry={reviewing} onClose={() => setReviewing(null)} />}
      {history && (
        <PaymentReviewsModal entry={history} timezone={timezone} onClose={() => setHistory(null)} />
      )}
    </>
  )
}
