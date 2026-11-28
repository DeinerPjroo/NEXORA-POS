import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Modal } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { CatalogPage } from '../catalog/types'
import type { Delivery } from './delivery-types'

type Method = { id: number; name: string; kind: 'cash' | 'non_cash'; revision: number }
export function DeliveryPaymentPlan({
  delivery,
  onClose,
}: {
  delivery: Delivery
  onClose: () => void
}) {
  const client = useQueryClient()
  const [choice, setChoice] = useState('')
  const [method, setMethod] = useState<Method | null>(null)
  const [reason, setReason] = useState('')
  const methods = useQuery({
    queryKey: ['delivery-payment-options'],
    queryFn: () => api<{ data: Method[] }>('deliveries/payment-options'),
  })
  const operation = useOperation<Delivery>(
    `deliveries/${delivery.id}/payment-plan`,
    async (updated) => {
      client.setQueriesData<CatalogPage<Delivery>>({ queryKey: ['deliveries'] }, (old) =>
        old
          ? { ...old, data: old.data.map((row) => (row.id === updated.id ? updated : row)) }
          : old,
      )
      await Promise.all([
        client.invalidateQueries({ queryKey: ['deliveries'] }),
        client.invalidateQueries({ queryKey: ['order', updated.order_id] }),
      ])
      onClose()
    },
  )
  return (
    <Modal title="Método de pago previsto" locked={operation.locked} onClose={onClose}>
      <p>
        Instrucción para el reparto. No registra dinero recibido ni confirma transferencias
        bancarias.
      </p>
      <fieldset disabled={operation.locked} className="form-stack">
        <Field label="Método previsto">
          <select
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value)
              const selected = methods.data?.data.find(
                (row) => String(row.id) === event.target.value,
              )
              setMethod(selected ? structuredClone(selected) : null)
            }}
          >
            <option value="" disabled>
              Selecciona una opción
            </option>
            <option value="clear">Sin definir</option>
            {methods.data?.data.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Motivo del método previsto">
          <textarea
            value={reason}
            minLength={3}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </fieldset>
      <ErrorNotice error={operation.error || methods.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="form-actions">
        <button disabled={operation.locked} onClick={onClose}>
          Volver
        </button>
        <button
          className="button primary"
          disabled={
            operation.isPending ||
            (!operation.uncertain &&
              (!choice || reason.trim().length < 3 || methods.isPending || !!methods.error))
          }
          onClick={() =>
            operation.send({
              revision: delivery.revision,
              payment_method_id: method?.id ?? null,
              ...(method ? { method_revision: method.revision } : {}),
              reason: reason.trim(),
            })
          }
        >
          {operation.uncertain ? 'Reintentar misma instrucción' : 'Guardar método previsto'}
        </button>
      </div>
    </Modal>
  )
}
