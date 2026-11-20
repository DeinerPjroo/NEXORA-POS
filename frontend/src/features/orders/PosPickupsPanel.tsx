import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Loading } from '../../components/ui'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { orderStates, type Order } from '../operations/types'
import { OrderIdentity, orderChannels } from './OrderIdentity'

export function PosPickupsPanel({
  branchId,
  onSelect,
  onClose,
  allOrders = false,
  initialChannel,
  active = true,
}: {
  branchId: number
  onSelect: (id: number) => void
  onClose: () => void
  allOrders?: boolean
  initialChannel?: Order['channel']
  active?: boolean
}) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState<Order['channel'] | ''>(initialChannel ?? '')
  const filterChannel = allOrders ? channel : 'takeaway'
  const query = useQuery({
    queryKey: ['orders', 'pos-pickups', branchId, status, page, allOrders, filterChannel],
    queryFn: ({ signal }) =>
      api<CatalogPage<Order>>(
        `orders?${filterChannel ? `channel=${filterChannel}&` : ''}branch_id=${branchId}${status ? `&status=${status}` : ''}&page=${page}&per_page=12`,
        { signal },
      ),
    enabled: active,
    refetchInterval: active ? 15000 : false,
  })
  return (
    <section
      className="pos-tables-inline pos-pickups"
      aria-label={allOrders ? 'Pedidos del terminal' : 'Recogidas del terminal'}
    >
      <header className="pos-tables-inline-heading">
        <h2>{allOrders ? 'Pedidos' : 'Recogidas'}</h2>
        <button type="button" onClick={onClose}>
          Volver al pedido
        </button>
      </header>
      <div className="pos-tables-picker">
        {allOrders && (
          <div className="order-channel-filters" role="group" aria-label="Filtrar tipo de pedido">
            <button
              type="button"
              aria-pressed={!channel}
              onClick={() => {
                setChannel('')
                setPage(1)
              }}
            >
              Todos
            </button>
            {Object.entries(orderChannels).map(([value, { label, icon: Icon }]) => (
              <button
                key={value}
                type="button"
                data-channel={value}
                aria-pressed={channel === value}
                onClick={() => {
                  setChannel(value as Order['channel'])
                  setPage(1)
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
        <select
          aria-label={allOrders ? 'Estado de pedidos' : 'Estado de recogidas'}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(orderStates).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <ErrorNotice error={query.error} />
        {query.error && (
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        )}
        {query.isPending ? (
          <Loading />
        ) : (
          query.data && (
            <>
              <div className="pos-pickup-grid">
                {query.data.data.map((order) => (
                  <button
                    type="button"
                    className="pos-pickup-card order-channel-card"
                    data-channel={order.channel}
                    key={order.id}
                    data-state={order.status}
                    onClick={() => onSelect(order.id)}
                  >
                    <span className="order-card-meta">
                      #{order.id} · {orderStates[order.status]}
                    </span>
                    <OrderIdentity order={order} />
                    {order.reference && <small>Referencia: {order.reference}</small>}
                    <small>
                      {order.items_count} líneas · Subtotal{' '}
                      {formatMoney(order.subtotal, order.currency)}
                    </small>
                    <small>
                      {order.sale_status === 'paid'
                        ? 'Pagada'
                        : order.sale_status === 'partially_paid'
                          ? 'Pago parcial'
                          : 'Ver cuenta'}
                    </small>
                  </button>
                ))}
              </div>
              {!query.data.data.length && (
                <p>
                  {allOrders
                    ? 'No hay pedidos con este filtro.'
                    : 'No hay recogidas con este filtro.'}
                </p>
              )}
              {query.data.meta.last_page > 1 && (
                <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
              )}
            </>
          )
        )}
      </div>
    </section>
  )
}
