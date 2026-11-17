import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, XCircle } from 'lucide-react'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { Order, OrderStatus } from '../operations/types'

export function OrderActions({ order }: { order: Order }) {
  const can = useCan()
  const [cancel, setCancel] = useState(false)
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<Order>(`orders/${order.id}/status`, async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['order', order.id] }),
      client.invalidateQueries({ queryKey: ['orders'] }),
    ])
    toast('Estado del pedido actualizado.')
  })
  const next: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
    open: ['preparing', 'Enviar a preparación'],
    preparing: ['ready', 'Marcar como listo'],
    ready: ['delivered', 'Marcar como entregado'],
  }
  const action = next[order.status]
  if (!action) return null
  return (
    <div className="order-actions">
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="operation-actions">
        {can('orders.manage') && (
          <button
            className="button primary"
            disabled={operation.isPending}
            onClick={() => operation.send({ revision: order.revision, status: action[0] })}
          >
            {operation.isPending
              ? 'Actualizando…'
              : operation.uncertain
                ? 'Reintentar envío'
                : action[1]}
            <ArrowRight size={16} />
          </button>
        )}
        {can('orders.cancel') && (
          <button
            className="button secondary"
            disabled={operation.locked}
            onClick={() => setCancel(true)}
          >
            <XCircle size={16} />
            Cancelar pedido
          </button>
        )}
      </div>
      {cancel && <CancelOrderModal order={order} onClose={() => setCancel(false)} />}
    </div>
  )
}

function CancelOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [revision] = useState(order.revision)
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<Order>(`orders/${order.id}/status`, async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['order', order.id] }),
      client.invalidateQueries({ queryKey: ['orders'] }),
    ])
    toast('Pedido cancelado. Su historial se conserva.')
    onClose()
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    operation.send({
      revision,
      status: 'cancelled',
      reason: new FormData(event.currentTarget).get('reason'),
    })
  }
  return (
    <Modal title={`Cancelar pedido #${order.id}`} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p className="muted">La cancelación queda registrada y el pedido se conserva.</p>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked}>
          <Field label="Motivo de la cancelación">
            <textarea name="reason" required minLength={3} maxLength={300} rows={3} autoFocus />
          </Field>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit pending={operation.isPending}>
            {operation.uncertain ? 'Reintentar envío' : 'Confirmar cancelación'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
