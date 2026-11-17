import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import { PaymentMethodField, useDefaultPaymentMethod } from './PaymentMethodPicker'
import type { CashOption, PaymentMethod, Sale } from './types'

type DraftPayment = {
  key: string
  method: PaymentMethod
  amount: string
  received_amount: string
  reference: string
}
const validMoney = (value: string) => /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(value)

export function AddPaymentsModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [snapshot] = useState(sale)
  const [lines, setLines] = useState<DraftPayment[]>([])
  const [chosen, setChosen] = useState<PaymentMethod | null>(null)
  const [cashId, setCashId] = useState('')
  const [amount, setAmount] = useState<string | null>(null)
  const [received, setReceived] = useState('')
  const [reference, setReference] = useState('')
  const methods = useDefaultPaymentMethod()
  const method = chosen ?? methods.data?.data[0]
  const cash = useQuery({
    queryKey: ['installment-cash', snapshot.branch_id],
    queryFn: () =>
      api<{ data: CashOption[] }>(`sales/cash-context?branch_id=${snapshot.branch_id}`),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const selected =
    cash.data?.data.find((item) => String(item.id) === cashId) ??
    (cashId === '' ? cash.data?.data[0] : undefined)
  const total = lines.reduce((sum, line) => sum + moneyUnits(line.amount), 0n)
  const remaining = moneyUnits(snapshot.balance_due) - total
  const normalized = (amount ?? unitsToMoney(remaining).slice(0, -2)).replace(',', '.')
  const tendered = received.replace(',', '.')
  const isCash = method?.kind === 'cash'
  const amountValid =
    validMoney(normalized) && moneyUnits(normalized) > 0n && moneyUnits(normalized) <= remaining
  const ready =
    !!method &&
    amountValid &&
    (isCash
      ? validMoney(tendered) && moneyUnits(tendered) >= moneyUnits(normalized)
      : !!reference.trim() && reference.length <= 120)
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<Sale>(`sales/${snapshot.id}/payments`, async () => {
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
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    toast('Pagos registrados. El saldo se actualizó.')
    onClose()
  })
  function add() {
    if (!ready || !method || lines.length >= 20) return
    setLines([
      ...lines,
      {
        key: crypto.randomUUID(),
        method,
        amount: normalized,
        received_amount: isCash ? tendered : normalized,
        reference,
      },
    ])
    setAmount(null)
    setReceived('')
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
      sale_revision: snapshot.revision,
      expected_balance: snapshot.balance_due.slice(0, -2),
      cash_session_id: selected.id,
      cash_revision: selected.revision,
      payments: lines.map((line) => ({
        payment_method_id: line.method.id,
        method_revision: line.method.revision,
        amount: line.amount,
        received_amount: line.received_amount,
        reference: line.reference || null,
      })),
    })
  }
  return (
    <Modal title={`Agregar pagos · ${snapshot.receipt_code}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="notice">
          <span>
            Saldo pendiente: <strong>{formatMoney(snapshot.balance_due, snapshot.currency)}</strong>
            . Puedes registrar un abono o combinar métodos en un solo envío.
          </span>
        </div>
        <ErrorNotice error={operation.error || cash.error || methods.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Caja de la operación">
            <select
              value={selected?.id ?? ''}
              onChange={(event) => setCashId(event.target.value)}
              required
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
            <p className="notice">Necesitas una sesión abierta en esta sucursal.</p>
          )}
          <div className="payment-draft-lines">
            {lines.map((line) => (
              <div className="payment-draft-line" key={line.key}>
                <div>
                  <strong>{line.method.name}</strong>
                  <small>
                    {line.method.kind === 'cash'
                      ? `Recibido ${formatMoney(line.received_amount, snapshot.currency)} · Cambio ${formatMoney(unitsToMoney(moneyUnits(line.received_amount) - moneyUnits(line.amount)), snapshot.currency)}`
                      : `Manual · ${line.reference}`}
                  </small>
                </div>
                <b>{formatMoney(line.amount, snapshot.currency)}</b>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Retirar pago ${line.method.name}`}
                  onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          {remaining > 0n && (
            <>
              <PaymentMethodField method={method} onPick={setChosen} />
              <Field label="Importe a agregar">
                <input
                  value={amount ?? unitsToMoney(remaining).slice(0, -2)}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                />
              </Field>
              {isCash ? (
                <Field label="Efectivo recibido para este pago">
                  <input
                    value={received}
                    onChange={(event) => setReceived(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
              ) : (
                <Field label="Referencia del pago a agregar">
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={120}
                  />
                </Field>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={!ready || lines.length >= 20}
                onClick={add}
              >
                <Plus size={16} />
                Agregar pago al lote
              </button>
            </>
          )}
          <div className="checkout-change">
            <span>Pagos preparados</span>
            <strong>{formatMoney(unitsToMoney(total), snapshot.currency)}</strong>
          </div>
          <p className="muted small">
            Saldo después del envío: {formatMoney(unitsToMoney(remaining), snapshot.currency)}. Solo
            los importes de efectivo cambian el saldo de caja.
          </p>
        </fieldset>
        {operation.error instanceof ApiError && operation.error.status === 409 && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void client.invalidateQueries({ queryKey: ['sale', snapshot.id] })
              onClose()
            }}
          >
            Revisar saldo actual y descartar este lote
          </button>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit
            pending={operation.isPending}
            disabled={!operation.uncertain && (!lines.length || !selected)}
          >
            {operation.uncertain ? 'Reintentar lote de pagos' : 'Confirmar lote de pagos'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
