import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { Sale } from './types'
import { useSalesCash } from './useSalesCash'

export function RefundModal({ sale: initial, onClose }: { sale: Sale; onClose: () => void }) {
  const [sale] = useState(initial)
  const client = useQueryClient()
  const toast = useToast()
  const [cashId, setCashId] = useState('')
  const nonCash = sale.payments.filter(
    (payment) => payment.method_kind === 'non_cash' && payment.refundable_amount !== '0.0000',
  )
  const cash = useSalesCash(sale.branch_id)
  const selected =
    cash.data?.data.find((item) => String(item.id) === cashId) ??
    (cashId === '' ? cash.data?.data[0] : undefined)
  const operation = useOperation<Sale>(`sales/${sale.id}/refund`, async () => {
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
    toast('Devolución registrada. La venta original se conserva.')
    onClose()
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!selected) return
    const fields = new FormData(event.currentTarget)
    operation.send({
      cash_session_id: selected.id,
      cash_revision: selected.revision,
      reason: fields.get('reason'),
      sale_revision: sale.revision,
      refund_references: nonCash.map((payment) => ({
        payment_id: payment.id,
        reference: fields.get(`refund_reference_${payment.id}`),
      })),
    })
  }
  return (
    <Modal title={`Devolver ${sale.receipt_code}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p>
          Devolverás los <strong>{formatMoney(sale.net_paid_amount, sale.currency)}</strong> que aún
          pueden devolverse, por sus métodos originales. El saldo no cobrado de{' '}
          {formatMoney(sale.balance_due, sale.currency)} se cancela. Solo los pagos de efectivo
          generan salida de caja. La venta y los pagos originales se conservan.
        </p>
        <ErrorNotice error={operation.error || cash.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Caja para entregar la devolución">
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
            <p className="notice">
              Abre una caja de esta sucursal antes de registrar la devolución.
            </p>
          )}
          <Field label="Motivo de la devolución">
            <textarea name="reason" minLength={3} maxLength={300} required rows={3} />
          </Field>
          {nonCash.map((payment) => (
            <Field
              key={payment.id}
              label={
                nonCash.length === 1
                  ? 'Referencia de la devolución'
                  : `Referencia de devolución · ${payment.method_name} #${payment.id}`
              }
            >
              <input name={`refund_reference_${payment.id}`} required maxLength={120} />
            </Field>
          ))}
        </fieldset>
        {!operation.uncertain &&
          operation.error instanceof ApiError &&
          [409, 422].includes(operation.error.status) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                operation.reset()
                void cash.refetch()
                void client.invalidateQueries({ queryKey: ['sale', sale.id] })
                onClose()
              }}
            >
              Revisar venta y cajas disponibles
            </button>
          )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit pending={operation.isPending} disabled={!operation.uncertain && !selected}>
            {operation.uncertain ? 'Reintentar devolución' : 'Confirmar devolución total'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
