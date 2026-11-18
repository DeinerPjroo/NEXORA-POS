import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { Sale, SalePayment } from './types'
import { useSalesCash } from './useSalesCash'

type DraftRefund = { payment: SalePayment; amount: string; reference: string }

export function PartialRefundModal({
  sale: initial,
  onClose,
}: {
  sale: Sale
  onClose: () => void
}) {
  const [sale] = useState(initial)
  const [lines, setLines] = useState<DraftRefund[]>([])
  const [paymentId, setPaymentId] = useState('')
  const [cashId, setCashId] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const available = sale.payments.filter(
    (p) => moneyUnits(p.refundable_amount) > 0n && !lines.some((line) => line.payment.id === p.id),
  )
  const payment = available.find((p) => String(p.id) === paymentId) ?? available[0]
  const normalized = amount.replace(',', '.')
  const ready =
    !!payment &&
    /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(normalized) &&
    moneyUnits(normalized) > 0n &&
    moneyUnits(normalized) <= moneyUnits(payment.refundable_amount) &&
    (payment.method_kind === 'cash' || !!reference.trim())
  const total = lines.reduce((sum, line) => sum + moneyUnits(line.amount), 0n)
  const client = useQueryClient()
  const toast = useToast()
  const cash = useSalesCash(sale.branch_id)
  const selected =
    cash.data?.data.find((item) => String(item.id) === cashId) ??
    (cashId === '' ? cash.data?.data[0] : undefined)
  const operation = useOperation<Sale>(`sales/${sale.id}/refunds`, async () => {
    await Promise.all(
      [
        'sale',
        'sales',
        'order',
        'orders',
        'cash-registers',
        'cash-sessions',
        'cash-session',
        'cash-movements',
        'payment-history',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    toast('Devolución registrada. El saldo pendiente se conserva.')
    onClose()
  })
  function add() {
    if (!ready || !payment || lines.length >= 20) return
    setLines([
      ...lines,
      {
        payment,
        amount: normalized,
        reference: payment.method_kind === 'non_cash' ? reference : '',
      },
    ])
    setPaymentId('')
    setAmount('')
    setReference('')
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!selected || !lines.length) return
    operation.send({
      sale_revision: sale.revision,
      expected_refundable: sale.net_paid_amount.slice(0, -2),
      cash_session_id: selected.id,
      cash_revision: selected.revision,
      reason: new FormData(event.currentTarget).get('reason'),
      refunds: lines.map((line) => ({
        payment_id: line.payment.id,
        amount: line.amount,
        reference: line.reference || null,
      })),
    })
  }
  return (
    <Modal title={`Devolución parcial · ${sale.receipt_code}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p>
          Elige los pagos originales y cuánto devolver de cada uno. Solo el efectivo genera salida
          de caja. El saldo pendiente de {formatMoney(sale.balance_due, sale.currency)} se conserva.
        </p>
        <ErrorNotice error={operation.error || cash.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Caja de la devolución parcial">
            <select
              required
              value={selected?.id ?? ''}
              onChange={(event) => setCashId(event.target.value)}
            >
              <option value="" disabled>
                Selecciona una caja abierta
              </option>
              {cash.data?.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · Sesión #{item.id}
                </option>
              ))}
            </select>
          </Field>
          {!cash.isPending && !cash.data?.data.length && (
            <p className="notice">Abre una caja de esta sucursal antes de devolver.</p>
          )}
          <div className="payment-draft-lines">
            {lines.map((line) => (
              <div className="payment-draft-line" key={line.payment.id}>
                <div>
                  <strong>
                    {line.payment.method_name} · Pago #{line.payment.id}
                  </strong>
                  {line.reference && <small>Manual · {line.reference}</small>}
                </div>
                <b>{formatMoney(line.amount, sale.currency)}</b>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Retirar devolución del pago ${line.payment.id}`}
                  onClick={() =>
                    setLines(lines.filter((item) => item.payment.id !== line.payment.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          {!!available.length && lines.length < 20 && (
            <>
              <Field label="Pago original a devolver">
                <select
                  value={payment?.id ?? ''}
                  onChange={(event) => {
                    setPaymentId(event.target.value)
                    setAmount('')
                    setReference('')
                  }}
                >
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} · {p.method_name} · Disponible{' '}
                      {formatMoney(p.refundable_amount, sale.currency)}
                      {p.account_id
                        ? ` · ${sale.accounts.find((item) => item.id === p.account_id)?.label}`
                        : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Importe a devolver del pago">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                />
              </Field>
              {payment?.method_kind === 'non_cash' && (
                <Field label="Referencia de la devolución parcial">
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={120}
                  />
                </Field>
              )}
              <button type="button" className="button secondary" disabled={!ready} onClick={add}>
                <Plus size={16} />
                Agregar devolución al lote
              </button>
            </>
          )}
          <div className="checkout-change">
            <span>Total a devolver ahora</span>
            <strong>{formatMoney(unitsToMoney(total), sale.currency)}</strong>
          </div>
          <Field label="Motivo de la devolución parcial">
            <textarea name="reason" required minLength={3} maxLength={300} rows={2} />
          </Field>
        </fieldset>
        {!operation.uncertain &&
          operation.error instanceof ApiError &&
          [409, 422].includes(operation.error.status) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void client.invalidateQueries({ queryKey: ['sale', sale.id] })
                void cash.refetch()
                onClose()
              }}
            >
              Revisar importes actuales y descartar este lote
            </button>
          )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit
            pending={operation.isPending}
            disabled={!operation.uncertain && (!selected || !lines.length)}
          >
            {operation.uncertain ? 'Reintentar devolución parcial' : 'Confirmar devolución parcial'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
