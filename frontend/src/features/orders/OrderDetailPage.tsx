import { Link, useParams } from 'react-router-dom'
import { ModifierDetails } from './ModifierDetails'
import { PriceDetails } from './PriceDetails'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock3, Plus, ShoppingBag } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError } from '../catalog/catalog-ui'
import { orderStates } from '../operations/types'
import type { Order } from '../operations/types'
import { OrderActions } from './OrderActions'

export function OrderDetailPage() {
  const { orderId = '' } = useParams()
  const can = useCan()
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['order', Number(orderId)],
    queryFn: ({ signal }) =>
      api<{ data: Order }>(`orders/${encodeURIComponent(orderId)}`, { signal }),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <CatalogError error={query.error} onRetry={() => void query.refetch()} />
  const order = query.data.data
  return (
    <>
      <Link className="text-button product-back" to="/pedidos">
        <ArrowLeft size={16} />
        Volver a pedidos
      </Link>
      <PageTitle
        eyebrow="CADA PEDIDO TIENE SU HISTORIA"
        title={`Pedido #${order.id}`}
        description={`${order.branch_name} · ${order.channel === 'takeaway' ? 'Para llevar' : 'En el restaurante'}`}
        action={
          can('orders.manage') &&
          can('catalog.view') && (
            <Link className="button secondary" to="/pedidos/nuevo">
              <Plus size={17} />
              Otro pedido
            </Link>
          )
        }
      />
      <div className="order-detail-layout">
        <section className="panel order-items-panel">
          <div className="panel-heading">
            <h2>
              <ShoppingBag size={18} />
              Detalle del pedido
            </h2>
            <span className={`pill order-state-${order.status}`}>{orderStates[order.status]}</span>
          </div>
          {(order.reference || order.customer_name) && (
            <p className="order-reference">
              {[order.reference, order.customer_name].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="order-item-list">
            {order.items?.map((item) => (
              <div className="saved-order-item" key={item.id}>
                <span className="saved-item-quantity">{item.quantity}×</span>
                <div>
                  <strong>{item.product_name}</strong>
                  {item.variant_name && <span>{item.variant_name}</span>}
                  <small>
                    {item.sku} · {formatMoney(item.unit_price, order.currency)} por unidad
                  </small>
                  {item.notes && <p>{item.notes}</p>}
                  <PriceDetails context={item.price_snapshot} currency={order.currency} />
                  <ModifierDetails
                    groups={item.modifiers_snapshot}
                    basePrice={item.base_unit_price}
                    currency={order.currency}
                  />
                  {item.tax_snapshot?.name && (
                    <small>
                      Perfil conservado: {item.tax_snapshot.name} ·{' '}
                      {item.tax_snapshot.rates
                        .map((rate) => `${rate.name} ${rate.rate.replace(/\.?0+$/, '') || '0'} %`)
                        .join(' + ')}
                    </small>
                  )}
                </div>
                <b>{formatMoney(item.line_subtotal, order.currency)}</b>
              </div>
            ))}
          </div>
          {order.notes && (
            <div className="saved-order-note">
              <strong>Observación general</strong>
              <p>{order.notes}</p>
            </div>
          )}
          <div className="order-subtotal">
            <span>Subtotal registrado</span>
            <strong>{formatMoney(order.subtotal, order.currency)}</strong>
          </div>
          <p className="muted small">
            {order.sale_id
              ? order.sale_status === 'refunded'
                ? 'Este pedido tiene una venta con devolución total.'
                : order.sale_status === 'partially_refunded'
                  ? 'Este pedido tiene una venta con devoluciones parciales. Consulta su saldo en el recibo.'
                  : order.sale_status === 'partially_paid'
                    ? 'Este pedido tiene una venta con saldo pendiente.'
                    : 'Este pedido tiene una venta cobrada.'
              : 'Pedido sin cobro registrado. No es una factura ni un comprobante de pago.'}
          </p>
          {order.sale_id
            ? can('sales.view') && (
                <Link className="button secondary" to={`/ventas/${order.sale_id}`}>
                  Ver recibo de venta
                </Link>
              )
            : order.status !== 'cancelled' &&
              can('sales.collect') && (
                <Link className="button primary" to={`/pedidos/${order.id}/cobrar`}>
                  Cobrar pedido
                </Link>
              )}
          <OrderActions key={`${order.id}:${order.revision}`} order={order} />
        </section>
        <section className="panel order-timeline">
          <div className="panel-heading">
            <h2>
              <Clock3 size={18} />
              Historial del pedido
            </h2>
          </div>
          {order.events?.map((event) => (
            <div className="order-timeline-event" key={event.id}>
              <i />
              <div>
                <strong>{orderStates[event.to_status]}</strong>
                <small>
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: session!.company.timezone,
                  }).format(new Date(event.created_at))}
                </small>
                {event.reason && <p>{event.reason}</p>}
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}
