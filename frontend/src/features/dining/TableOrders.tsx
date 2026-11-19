import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Loading } from '../../components/ui'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { Order } from '../operations/types'
import { orderStates } from '../operations/types'
import type { DiningSelection } from './session-types'
import { useCan } from '../auth/SessionProvider'

export function TableOrders({ selection }: { selection: DiningSelection }) {
  const [page, setPage] = useState(1)
  const can = useCan()
  const query = useQuery({
    queryKey: ['table-orders', selection.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<Order>>(`dining-sessions/${selection.id}/orders?page=${page}`, { signal }),
    refetchInterval: 15000,
  })
  return (
    <section className="pos-saved-orders" aria-label="Pedidos guardados de la mesa">
      <header>
        <strong>Pedidos guardados</strong>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Actualizar
        </button>
      </header>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : query.data?.data.length ? (
        <>
          {query.data.data.map((order) => (
            <article key={order.id} className="pos-saved-order">
              <div>
                <strong>Pedido #{order.id}</strong>
                <span>
                  {orderStates[order.status]}
                  {order.sale_id ? ' · Venta registrada' : ''}
                </span>
              </div>
              <table aria-label={'Líneas guardadas del pedido ' + order.id}>
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
                        {item.product_name}
                        {item.variant_name && <small>{item.variant_name}</small>}
                        {item.notes && <small>{item.notes}</small>}
                      </td>
                      <td>{formatMoney(item.line_subtotal, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <footer>
                <span>Subtotal {formatMoney(order.subtotal, order.currency)}</span>
                {!order.sale_id && order.status !== 'cancelled' && can('sales.collect') && (
                  <Link to={`/pos/pedidos/${order.id}/cobrar`}>Cobrar pedido #{order.id}</Link>
                )}
              </footer>
            </article>
          ))}
          {query.data.meta.last_page > 1 && (
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          )}
        </>
      ) : (
        !query.error && <p>Esta mesa todavía no tiene pedidos guardados.</p>
      )}
    </section>
  )
}
