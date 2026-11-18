import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading, Modal, Submit, useToast } from '../../components/ui'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { PaymentEntry, PaymentReview, ReviewStatus } from './payment-history-types'
import { reviewStates } from './payment-history-types'

export function ManualReviewModal({
  entry: initial,
  onClose,
}: {
  entry: PaymentEntry
  onClose: () => void
}) {
  const [entry] = useState(initial)
  const [status, setStatus] = useState<ReviewStatus>('matched')
  const [observed, setObserved] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const client = useQueryClient()
  const toast = useToast()
  const amount = observed.replace(',', '.')
  const valid = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(amount)
  const difference = valid ? moneyUnits(amount) - moneyUnits(entry.net_paid_amount) : null
  const ready =
    confirmed &&
    (status === 'pending'
      ? notes.trim().length >= 3
      : valid &&
        !!reference.trim() &&
        (status === 'matched' ? difference === 0n : difference !== 0n && notes.trim().length >= 3))
  const refresh = () =>
    Promise.all(
      ['payment-history', 'payment-reviews'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
  const operation = useOperation<PaymentReview>(
    `finance/payments/${entry.id}/reviews`,
    async () => {
      await refresh()
      toast('Revisión manual registrada.')
      onClose()
    },
  )
  function submit(event: FormEvent) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!ready) return
    operation.send({
      sale_revision: entry.sale_revision,
      review_revision: entry.review_revision,
      expected_net_amount: entry.net_paid_amount.slice(0, -2),
      status,
      observed_amount: status === 'pending' ? null : amount,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      review_confirmed: confirmed,
    })
  }
  return (
    <Modal title={`Revisión manual · Pago #${entry.id}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p>
          {entry.receipt_code} · {entry.method_name} ·{' '}
          {entry.reference || 'Sin referencia original'}
        </p>
        <div className="checkout-change">
          <span>Neto actual del pago</span>
          <strong>{formatMoney(entry.net_paid_amount, entry.currency)}</strong>
        </div>
        <p className="muted small">
          Declara lo que comprobaste en tu soporte. Esta revisión humana no confirma un cobro
          bancario y no modifica pagos, devoluciones ni caja.
        </p>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Resultado de la revisión">
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ReviewStatus)
                setConfirmed(false)
              }}
            >
              {(['matched', 'difference', 'pending'] as const).map((value) => (
                <option value={value} key={value}>
                  {reviewStates[value]}
                </option>
              ))}
            </select>
          </Field>
          {status !== 'pending' && (
            <>
              <Field label="Importe observado en el soporte">
                <input
                  required
                  inputMode="decimal"
                  value={observed}
                  onChange={(event) => {
                    setObserved(event.target.value)
                    setConfirmed(false)
                  }}
                />
              </Field>
              {difference !== null && (
                <p className="notice">
                  Diferencia observada: {formatMoney(unitsToMoney(difference), entry.currency)}
                </p>
              )}
            </>
          )}
          <Field
            label={
              status === 'pending'
                ? 'Referencia del soporte (opcional)'
                : 'Referencia del soporte revisado'
            }
          >
            <input
              required={status !== 'pending'}
              maxLength={120}
              value={reference}
              onChange={(event) => {
                setReference(event.target.value)
                setConfirmed(false)
              }}
            />
          </Field>
          <Field
            label={
              status === 'matched'
                ? 'Observaciones (opcional)'
                : 'Motivo de la diferencia o pendiente'
            }
          >
            <textarea
              required={status !== 'matched'}
              minLength={3}
              maxLength={300}
              rows={2}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value)
                setConfirmed(false)
              }}
            />
          </Field>
          <label className="check-line">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Confirmo que esta declaración corresponde a mi revisión manual.
          </label>
        </fieldset>
        {!operation.uncertain &&
          operation.error instanceof ApiError &&
          [409, 422].includes(operation.error.status) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void refresh()
                onClose()
              }}
            >
              Consultar datos actuales y descartar este formulario
            </button>
          )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit pending={operation.isPending} disabled={!operation.uncertain && !ready}>
            {operation.uncertain ? 'Reintentar revisión' : 'Guardar revisión manual'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}

export function PaymentReviewsModal({
  entry,
  timezone,
  onClose,
}: {
  entry: PaymentEntry
  timezone: string
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['payment-reviews', entry.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<PaymentReview>>(`finance/payments/${entry.id}/reviews?page=${page}`, {
        signal,
      }),
    staleTime: 0,
  })
  const date = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value))
  return (
    <Modal title={`Revisiones · Pago #${entry.id}`} onClose={onClose}>
      <p className="muted small">
        Declaraciones humanas conservadas. Estado al abrir: {reviewStates[entry.review_status]}. Los
        importes de cada declaración corresponden a la revisión financiera de ese momento.
      </p>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <div className="form-stack">
          {query.data.data.map((review) => (
            <article className="sale-account-card" key={review.id}>
              <h3>
                Revisión {review.version} · {reviewStates[review.status]}
              </h3>
              <p className="muted small">
                {review.actor_name} · {date(review.created_at)} · Revisión de venta{' '}
                {review.sale_revision}
              </p>
              <dl className="sale-amounts">
                <div>
                  <dt>Neto al revisar</dt>
                  <dd>{formatMoney(review.expected_net_amount, review.currency)}</dd>
                </div>
                {review.observed_amount !== null && (
                  <div>
                    <dt>Observado en soporte</dt>
                    <dd>{formatMoney(review.observed_amount, review.currency)}</dd>
                  </div>
                )}
                {review.difference_amount !== null && (
                  <div>
                    <dt>Diferencia declarada</dt>
                    <dd>{formatMoney(review.difference_amount, review.currency)}</dd>
                  </div>
                )}
              </dl>
              {review.reference && (
                <p className="payment-review-evidence">Soporte: {review.reference}</p>
              )}
              {review.notes && <p className="payment-review-evidence">{review.notes}</p>}
            </article>
          ))}
          {!query.data.data.length && <p>No hay revisiones en esta página.</p>}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </div>
      )}
    </Modal>
  )
}
