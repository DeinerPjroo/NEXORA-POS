import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Clock3, Plus, ShoppingBag } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import { orderStates } from '../operations/types'
import type { Order } from '../operations/types'

export function OrdersPage() {
  const context = useOperationContext()
  const { session } = useSession()
  const can = useCan()
  const [branch, setBranch] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const selected =
    branch ??
    context.data?.branches.find((item) => item.is_active)?.id ??
    context.data?.branches[0]?.id ??
    null
  const params = new URLSearchParams({
    branch_id: String(selected),
    page: String(page),
    per_page: '12',
  })
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['orders', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Order>>(`orders?${params}`, { signal }),
    enabled: selected !== null,
  })
  return (
    <>
      <PageTitle
        eyebrow="DEL PRIMER SABOR A LA ENTREGA"
        title="Pedidos"
        description="Consulta lo que está pendiente, sigue la preparación y conserva su historia."
        action={
          can('orders.manage') &&
          can('catalog.view') && (
            <Link className="button primary" to="/pedidos/nuevo">
              <Plus size={17} />
              Nuevo pedido
            </Link>
          )
        }
      />
      <div className="operation-toolbar">
        <OperationalBranchPicker
          branches={context.data?.branches ?? []}
          value={selected}
          onChange={(id) => {
            setBranch(id)
            setPage(1)
          }}
        />
        <select
          className="order-state-filter"
          aria-label="Filtrar estado de pedidos"
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
        <span className="muted">Pedidos de preparación · Sin registro de cobro</span>
      </div>
      {context.error ? (
        <CatalogError error={context.error} onRetry={() => void context.refetch()} />
      ) : query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          {query.data.data.length ? (
            <div className="orders-grid">
              {query.data.data.map((order) => (
                <Link
                  className="panel order-summary-card"
                  to={`/pedidos/${order.id}`}
                  key={order.id}
                >
                  <div className="panel-heading">
                    <span className="order-number">#{order.id}</span>
                    <span className={`pill order-state-${order.status}`}>
                      {orderStates[order.status]}
                    </span>
                  </div>
                  <h2>{order.reference || order.customer_name || 'Pedido del restaurante'}</h2>
                  <p>
                    {order.channel === 'takeaway' ? 'Para llevar' : 'En el restaurante'} ·{' '}
                    {order.items_count} líneas
                  </p>
                  <div className="order-card-time">
                    <Clock3 size={13} />
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: session!.company.timezone,
                    }).format(new Date(order.created_at))}
                  </div>
                  <div className="order-card-bottom">
                    <span>
                      <small>Subtotal</small>
                      <strong>{formatMoney(order.subtotal, order.currency)}</strong>
                    </span>
                    <ArrowUpRight size={20} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state panel">
              <ShoppingBag size={36} />
              <h2>El próximo pedido empieza aquí.</h2>
              <p>
                {status
                  ? 'No hay pedidos con este estado en la sucursal.'
                  : 'Los pedidos que registres se conservarán en este espacio.'}
              </p>
              {can('orders.manage') && can('catalog.view') && (
                <Link className="button primary" to="/pedidos/nuevo">
                  Tomar el primer pedido
                  <Plus size={16} />
                </Link>
              )}
            </div>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
    </>
  )
}
