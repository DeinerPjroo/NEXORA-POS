import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { CashOption, Sale } from './types'

export function RefundModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const client = useQueryClient()
  const toast = useToast()
  const [cashId, setCashId] = useState('')
  const isCash = sale.payment?.method_kind !== 'non_cash'
  const cash = useQuery({
    queryKey: ['refund-cash', sale.branch_id],
    queryFn: () => api<{ data: CashOption[] }>(`sales/cash-context?branch_id=${sale.branch_id}`),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
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
    operation.send({
      cash_session_id: selected.id,
      cash_revision: selected.revision,
      reason: new FormData(event.currentTarget).get('reason'),
      refund_reference: new FormData(event.currentTarget).get('refund_reference') || null,
    })
  }
  return (
    <Modal title={`Devolver ${sale.receipt_code}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p>
          Registrarás una devolución total de{' '}
          <strong>{formatMoney(sale.total, sale.currency)}</strong> por el método original:{' '}
          {sale.payment?.method_name ?? 'Efectivo'}.{' '}
          {isCash
            ? 'Genera una salida de efectivo.'
            : 'Registro manual sin salida de efectivo ni confirmación de proveedor.'}{' '}
          El recibo y pago originales se conservan.
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
          {!isCash && (
            <Field label="Referencia de la devolución">
              <input name="refund_reference" required maxLength={120} />
            </Field>
          )}
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
              }}
            >
              Actualizar cajas disponibles
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
