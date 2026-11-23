import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal } from '../../components/ui'
import type { Order, OrderItem } from '../operations/types'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'

export function DeliveryItemEditor({
  order,
  item,
  onClose,
}: {
  order: Order
  item: OrderItem
  onClose: () => void
}) {
  const client = useQueryClient()
  const [snapshot, setSnapshot] = useState(order)
  const [action, setAction] = useState<'correct' | 'cancel'>(
    item.order_combo_id ? 'cancel' : 'correct',
  )
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<unknown>(null)
  const operation = useOperation<Order>(`orders/${order.id}/item-changes`, async () => {
    await Promise.all(
      ['order', 'orders', 'deliveries', 'kitchen-tickets', 'kitchen-preview'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    onClose()
  })
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  const unavailable =
    !!snapshot.sale_id ||
    snapshot.status === 'cancelled' ||
    !['pending', 'assigned'].includes(snapshot.delivery_status ?? '') ||
    !snapshot.items?.some((line) => line.id === item.id)
  async function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const fresh = await api<{ data: Order }>(`orders/${order.id}`)
      setSnapshot(fresh.data)
      operation.reset()
    } catch (error) {
      setRefreshError(error)
    } finally {
      setRefreshing(false)
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (unavailable || refreshing || conflict) return
    const fields = new FormData(event.currentTarget)
    operation.send({
      order_revision: snapshot.revision,
      delivery_revision: snapshot.delivery_revision,
      item_id: item.id,
      action,
      reason: fields.get('reason'),
      ...(action === 'correct'
        ? {
            quantity: Number(fields.get('quantity')),
            notes: String(fields.get('notes') ?? '').trim() || null,
          }
        : {}),
    })
  }
  return (
    <Modal
      title="Corregir producto del domicilio"
      className="modal delivery-item-modal"
      onClose={onClose}
      locked={operation.locked || refreshing}
    >
      <form onSubmit={submit} className="form-stack">
        <header>
          <strong>
            {item.quantity} × {item.product_name}
          </strong>
          <p>Pedido #{order.id} · La tarifa de envío se conserva.</p>
        </header>
        <ErrorNotice error={operation.error || refreshError} />
        <OperationNotice uncertain={operation.uncertain} />
        {unavailable && (
          <p className="notice">
            El producto ya cambió o el domicilio no admite modificaciones. Consulta nuevamente su
            detalle.
          </p>
        )}
        {conflict && !operation.locked && (
          <button type="button" disabled={refreshing} onClick={() => void refresh()}>
            Actualizar pedido conservando formulario
          </button>
        )}
        <fieldset disabled={operation.locked || refreshing || unavailable} className="form-stack">
          <div className="delivery-item-modes">
            {!item.order_combo_id && (
              <button
                type="button"
                aria-pressed={action === 'correct'}
                onClick={() => setAction('correct')}
              >
                Corregir cantidad o nota
              </button>
            )}
            <button
              type="button"
              aria-pressed={action === 'cancel'}
              onClick={() => setAction('cancel')}
            >
              {item.order_combo_id ? 'Retirar combo completo' : 'Retirar producto'}
            </button>
          </div>
          {action === 'correct' ? (
            <>
              <Field label="Cantidad que queda">
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  max={item.quantity}
                  step="1"
                  defaultValue={item.quantity}
                  required
                />
              </Field>
              <Field label="Notas de preparación">
                <textarea name="notes" maxLength={300} defaultValue={item.notes ?? ''} rows={3} />
              </Field>
              <p className="muted small">
                Para aumentar cantidades, usa Añadir productos. Si ya está en cocina, la corrección
                aparece en su comanda sin reenviar los demás productos.
              </p>
            </>
          ) : (
            <p className="notice">
              {item.order_combo_id
                ? 'Se retirarán todos los componentes de este combo.'
                : 'Se retirará esta línea completa.'}{' '}
              Al retirar el último producto se cancela el domicilio.
            </p>
          )}
          <Field label="Motivo del cambio">
            <textarea name="reason" required minLength={3} maxLength={300} rows={2} />
          </Field>
        </fieldset>
        <footer className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={operation.locked || refreshing}
            onClick={onClose}
          >
            Volver
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={
              operation.isPending ||
              (!operation.uncertain && (unavailable || refreshing || conflict))
            }
          >
            {operation.uncertain
              ? 'Reintentar mismo cambio'
              : action === 'cancel'
                ? 'Confirmar retiro'
                : 'Guardar corrección'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
