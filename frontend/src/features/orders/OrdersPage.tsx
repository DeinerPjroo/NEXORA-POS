import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock3, Plus, ClipboardList, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import { orderStates } from '../operations/types'
import type { Order } from '../operations/types'
import { posPermissions } from '../pos/pos-permissions'
import { OrderIdentity } from './OrderIdentity'

export function OrdersPage({ channel }: { channel?: 'takeaway' }) {
  const context = useOperationContext()
  const { session } = useSession()
  const can = useCan()
  const newOrderPath =
    (posPermissions.every(can) ? '/pos' : '/pedidos/nuevo') + (channel ? '?canal=takeaway' : '')
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
  if (channel) params.set('channel', channel)
  const query = useQuery({
    queryKey: ['orders', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Order>>(`orders?${params}`, { signal }),
    enabled: selected !== null,
    refetchInterval: 15000,
  })
  return (
    <section className="terminal-orders" aria-label="Pedidos operativos">
      <PageTitle
        eyebrow="DEL PRIMER SABOR A LA ENTREGA"
        title={channel ? 'Para llevar · Recogidas' : 'Pedidos'}
        description="Consulta lo que está pendiente, sigue la preparación y conserva su historia."
        action={
          can('orders.manage') &&
          can('catalog.view') && (
            <Link className="button primary" to={newOrderPath}>
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
        <button
          type="button"
          className="button secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={16} />
          Actualizar pedidos
        </button>
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
            <div className="terminal-order-list" aria-label="Lista de pedidos">
              {query.data.data.map((order) => (
                <Link
                  className="terminal-order-row order-channel-card"
                  data-channel={order.channel}
                  to={`/pedidos/${order.id}`}
                  key={order.id}
                >
                  <span className="terminal-order-id">#{order.id}</span>
                  <div className="terminal-order-info">
                    <OrderIdentity order={order} />
                    {order.reference && <small>Referencia: {order.reference}</small>}
                    <small>
                      {order.channel === 'takeaway'
                        ? 'Recogida en mostrador'
                        : order.channel === 'delivery'
                          ? 'Domicilio'
                          : 'Consumo en mesa'}{' '}
                      · {order.items_count} líneas
                      {order.dining_snapshot &&
                        ` · Ubicación inicial: ${order.dining_snapshot.tables.map((t) => t.name).join(', ')}`}
                    </small>
                  </div>
                  <span className={`pill order-state-${order.status}`}>
                    {orderStates[order.status]}
                  </span>
                  <time className="terminal-order-time" dateTime={order.created_at}>
                    <Clock3 size={13} />
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: session!.company.timezone,
                    }).format(new Date(order.created_at))}
                  </time>
                  <span className="terminal-order-amount">
                    <small>Subtotal</small>
                    <strong>{formatMoney(order.subtotal, order.currency)}</strong>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state panel">
              <ClipboardList size={36} />
              <h2>Sin pedidos para mostrar</h2>
              <p>
                {status
                  ? 'No hay pedidos con este estado en la sucursal.'
                  : 'Los pedidos que registres se conservarán en este espacio.'}
              </p>
              {can('orders.manage') && can('catalog.view') && (
                <Link className="button primary" to={newOrderPath}>
                  Tomar el primer pedido
                  <Plus size={16} />
                </Link>
              )}
            </div>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
    </section>
  )
}
