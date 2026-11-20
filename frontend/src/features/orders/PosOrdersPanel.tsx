import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Loading } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { orderStates, type Order } from '../operations/types'
import { PosPickupsPanel } from './PosPickupsPanel'
import { OrderIdentity } from './OrderIdentity'

export function PosOrdersPanel({
  branchId,
  onClose,
  onKitchen,
  onCheckout,
}: {
  branchId: number
  onClose: () => void
  onKitchen: (id: number) => void
  onCheckout: (id: number) => void
}) {
  const [orderId, setOrderId] = useState<number | null>(null)
  const can = useCan()
  const query = useQuery({
    queryKey: ['orders', 'pos-preview', branchId, orderId],
    queryFn: ({ signal }) => api<{ data: Order }>(`orders/${orderId}`, { signal }),
    enabled: !!orderId,
    refetchInterval: 15000,
  })
  if (!orderId)
    return <PosPickupsPanel branchId={branchId} allOrders onSelect={setOrderId} onClose={onClose} />
  const order = query.data?.data.branch_id === branchId ? query.data.data : undefined
  return (
    <section
      className="pos-tables-inline pos-order-preview"
      aria-label="Detalle de pedido en terminal"
    >
      <header className="pos-tables-inline-heading">
        <h2>Pedido #{orderId}</h2>
        <button type="button" onClick={() => setOrderId(null)}>
          Ver otros pedidos
        </button>
        <button type="button" onClick={onClose}>
          Volver al pedido
        </button>
      </header>
      <ErrorNotice error={query.error} />
      {query.error && (
        <button type="button" onClick={() => void query.refetch()}>
          Reintentar consulta
        </button>
      )}
      {query.isPending ? (
        <Loading />
      ) : (
        order && (
          <>
            <div className="pos-dining-selection order-channel-card" data-channel={order.channel}>
              <OrderIdentity order={order} />
              <div>{orderStates[order.status]}</div>
              {order.reference && <div>Referencia: {order.reference}</div>}
            </div>
            <div className="pos-order-preview-lines">
              <table>
                <thead>
                  <tr>
                    <th>Cant.</th>
                    <th>Producto</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.quantity}</td>
                      <td>
                        <strong>
                          {item.product_name}
                          {item.variant_name && ` · ${item.variant_name}`}
                        </strong>
                        {item.notes && <small>{item.notes}</small>}
                        <small>
                          {(item.preparation_destination ??
                            (order.channel === 'dine_in' ? 'table' : 'takeaway')) === 'takeaway'
                            ? 'Empacar'
                            : 'Servir en mesa'}
                        </small>
                      </td>
                      <td>{formatMoney(item.line_subtotal, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {order.notes && <p>Nota: {order.notes}</p>}
            </div>
            <div className="order-subtotal">
              <span>SUBTOTAL</span>
              <strong>{formatMoney(order.subtotal, order.currency)}</strong>
            </div>
            <div className="pos-order-preview-actions">
              {can('orders.manage') && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={['cancelled', 'delivered'].includes(order.status)}
                  onClick={() => onKitchen(order.id)}
                >
                  Enviar a cocina
                </button>
              )}
              {can('sales.collect') && (
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    order.status === 'cancelled' ||
                    ['paid', 'refunded'].includes(order.sale_status ?? '')
                  }
                  onClick={() => onCheckout(order.id)}
                >
                  {order.sale_status === 'paid' ? 'Pagada' : 'Cobrar pedido'}
                </button>
              )}
            </div>
          </>
        )
      )}
    </section>
  )
}
