import { useQuery } from '@tanstack/react-query'
import { Bike, MapPin, Phone, UserRound, ArrowLeft, CookingPot } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney, moneyUnits } from '../../lib/money'
import { ErrorNotice, Loading } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import type { Order } from '../operations/types'
import { OrderPrintActions } from './OrderPrintActions'
import { deliveryLabels, deliveryKitchenLabels, type Delivery } from './delivery-types'

export function DeliveryDetail({
  delivery,
  onBack,
  onAction,
  onCollect,
  onKitchen,
  onEdit,
  onAdd,
}: {
  delivery: Delivery | null
  onBack: () => void
  onAction: (status: string) => void
  onCollect: () => void
  onKitchen: () => void
  onEdit: () => void
  onAdd: (order: Order) => void
}) {
  const can = useCan()
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['order', delivery?.order_id],
    enabled: !!delivery,
    queryFn: ({ signal }) => api<{ data: Order }>(`orders/${delivery!.order_id}`, { signal }),
    refetchOnMount: 'always',
    refetchInterval: 10000,
  })
  const order =
    delivery &&
    query.data?.data.id === delivery.order_id &&
    query.data.data.branch_id === delivery.branch_id
      ? query.data.data
      : undefined
  const time = (date: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: session!.company.timezone,
    }).format(new Date(date))
  if (!delivery)
    return (
      <aside className="delivery-detail delivery-detail-empty" aria-label="Detalle del domicilio">
        <Bike size={48} aria-hidden="true" />
        <h2>Selecciona un domicilio</h2>
        <p>Consulta sus productos, destino y reparto. Las acciones aparecen aquí.</p>
      </aside>
    )
  const stage = ['pending', 'assigned', 'out_for_delivery', 'delivered'].indexOf(delivery.status)
  const canTransition = can('orders.manage') || can('deliveries.operate')
  const ready = ['ready', 'delivered'].includes(delivery.preparation_status)
  return (
    <aside
      className="delivery-detail"
      aria-label="Detalle del domicilio"
      data-status={delivery.status}
    >
      <header className="delivery-detail-heading">
        <button type="button" className="delivery-mobile-back" onClick={onBack}>
          <ArrowLeft size={17} />
          Domicilios
        </button>
        <span>DOMICILIO · PEDIDO #{delivery.order_id}</span>
        <h2>{delivery.recipient_name}</h2>
        <span className="delivery-state">{deliveryLabels[delivery.status]}</span>
      </header>
      <div className="delivery-detail-body">
        {stage >= 0 && (
          <ol className="delivery-stages" aria-label="Etapas de entrega">
            {['Recibido', 'Asignado', 'En reparto', 'Entregado'].map((label, index) => (
              <li
                key={label}
                data-reached={index <= stage}
                aria-current={index === stage ? 'step' : undefined}
              >
                <i />
                {label}
              </li>
            ))}
          </ol>
        )}
        <section className="delivery-destination" aria-label="Datos de entrega">
          <p>
            <MapPin size={17} aria-hidden="true" />
            <strong>{delivery.address}</strong>
          </p>
          {delivery.neighborhood && <p>{delivery.neighborhood}</p>}
          {delivery.location_reference && <p>Referencia: {delivery.location_reference}</p>}
          <p>
            <Phone size={16} aria-hidden="true" />
            {delivery.phone}
          </p>
          {delivery.instructions && (
            <p className="delivery-instructions">{delivery.instructions}</p>
          )}
          <div className="delivery-detail-tags">
            <span>
              <UserRound size={14} />
              {delivery.courier_name ?? 'Sin repartidor'}
            </span>
            <span>
              <CookingPot size={14} />
              {deliveryKitchenLabels[delivery.preparation_status]}
            </span>
          </div>
        </section>
        <ErrorNotice error={query.error} />
        {query.error && (
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar pedido
          </button>
        )}
        {query.isPending && <Loading />}
        {order && (
          <>
            <div className="delivery-items-heading">
              <strong>Productos del pedido</strong>
              <span>{order.items?.reduce((sum, item) => sum + item.quantity, 0)} unidades</span>
            </div>
            <table className="delivery-items" aria-label="Productos del domicilio">
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
                      <strong>{item.product_name}</strong>
                      {item.variant_name && <small>{item.variant_name}</small>}
                      {item.notes && <small>{item.notes}</small>}
                    </td>
                    <td>{formatMoney(item.line_subtotal, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="delivery-order-amounts">
              <span>Subtotal de productos</span>
              <strong>{formatMoney(order.subtotal, order.currency)}</strong>
              {!!order.delivery_fee_total && moneyUnits(order.delivery_fee_total) > 0n && (
                <>
                  <span>Domicilio con sus impuestos</span>
                  <strong>{formatMoney(order.delivery_fee_total, order.currency)}</strong>
                </>
              )}
            </div>
            <p className="delivery-payment-state">
              {!order.sale_id
                ? 'Sin cobro registrado'
                : order.sale_status === 'partially_paid'
                  ? 'Saldo pendiente'
                  : order.sale_status === 'refunded'
                    ? 'Venta devuelta'
                    : order.sale_status === 'partially_refunded'
                      ? 'Con devolución parcial'
                      : 'Cobro registrado'}
            </p>
            <div className="delivery-secondary-actions">
              <OrderPrintActions order={order} />
              {can('orders.manage') &&
                ['pending', 'assigned'].includes(delivery.status) &&
                !order.sale_id &&
                !['cancelled', 'delivered'].includes(order.status) && (
                  <button type="button" onClick={onEdit}>
                    Editar cliente
                  </button>
                )}
              {can('orders.manage') && !['cancelled', 'delivered'].includes(order.status) && (
                <button type="button" onClick={onKitchen}>
                  Enviar a cocina
                </button>
              )}
            </div>
          </>
        )}
        <details className="delivery-history">
          <summary>Historial de entrega · {delivery.events.length}</summary>
          <ol>
            {delivery.events.map((event) => (
              <li key={event.id}>
                <strong>{deliveryLabels[event.status as Delivery['status']]}</strong>
                <time dateTime={event.created_at}>{time(event.created_at)}</time>
                {event.reason && <p>{event.reason}</p>}
              </li>
            ))}
          </ol>
        </details>
      </div>
      <footer className="delivery-detail-actions">
        {can('orders.manage') &&
          can('catalog.view') &&
          order &&
          !order.sale_id &&
          order.status !== 'cancelled' &&
          ['pending', 'assigned'].includes(order.delivery_status ?? '') && (
            <button type="button" className="delivery-main-action" onClick={() => onAdd(order)}>
              Añadir productos
            </button>
          )}
        {can('orders.manage') && ['pending', 'assigned'].includes(delivery.status) && (
          <button type="button" onClick={() => onAction('assigned')}>
            <UserRound size={16} />
            {delivery.courier_id ? 'Cambiar repartidor' : 'Asignar repartidor'}
          </button>
        )}
        {canTransition && ['assigned', 'out_for_delivery'].includes(delivery.status) && (
          <button
            type="button"
            className="delivery-main-action"
            disabled={delivery.status === 'assigned' && !ready}
            title={
              !ready && delivery.status === 'assigned'
                ? 'Cocina debe marcar el pedido listo'
                : undefined
            }
            onClick={() =>
              onAction(delivery.status === 'assigned' ? 'out_for_delivery' : 'delivered')
            }
          >
            <Bike size={17} />
            {delivery.status === 'assigned' ? 'Sale a reparto' : 'Confirmar entrega al cliente'}
          </button>
        )}
        {can('sales.collect') &&
          order &&
          order.status !== 'cancelled' &&
          !['paid', 'refunded'].includes(order.sale_status ?? '') && (
            <button type="button" className="delivery-collect-action" onClick={onCollect}>
              {order.sale_id ? 'Continuar cobro' : 'Cobrar pedido'}
            </button>
          )}
      </footer>
    </aside>
  )
}
