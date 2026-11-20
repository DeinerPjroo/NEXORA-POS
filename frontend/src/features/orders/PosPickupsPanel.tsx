import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Loading } from '../../components/ui'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { orderStates, type Order } from '../operations/types'

export function PosPickupsPanel({
  branchId,
  onSelect,
  onClose,
}: {
  branchId: number
  onSelect: (id: number) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const query = useQuery({
    queryKey: ['orders', 'pos-pickups', branchId, status, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<Order>>(
        `orders?channel=takeaway&branch_id=${branchId}${status ? `&status=${status}` : ''}&page=${page}&per_page=12`,
        { signal },
      ),
    refetchInterval: 15000,
  })
  return (
    <section className="pos-tables-inline pos-pickups" aria-label="Recogidas del terminal">
      <header className="pos-tables-inline-heading">
        <h2>Recogidas</h2>
        <button type="button" onClick={onClose}>
          Volver al pedido
        </button>
      </header>
      <div className="pos-tables-picker">
        <select
          aria-label="Estado de recogidas"
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
                    className="pos-pickup-card"
                    key={order.id}
                    data-state={order.status}
                    onClick={() => onSelect(order.id)}
                  >
                    <span>
                      #{order.id} · {orderStates[order.status]}
                    </span>
                    <strong>
                      {order.reference || order.customer_name || 'Recogida en mostrador'}
                    </strong>
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
              {!query.data.data.length && <p>No hay recogidas con este filtro.</p>}
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
