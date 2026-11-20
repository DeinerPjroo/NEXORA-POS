import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChefHat,
  Clock3,
  History,
  RefreshCw,
  Settings2,
  Flame,
  CheckCheck,
  Inbox,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { KitchenTicket } from './types'
import './kitchen.css'
import { preparationLabels } from './TableKitchen'
const labels = {
  new: 'Nuevas',
  preparing: 'En preparación',
  ready: 'Terminadas',
  delivered: 'Entregadas',
  cancelled: 'Canceladas',
}
export function KitchenBoardPage() {
  const context = useOperationContext()
  const can = useCan()
  const [branch, setBranch] = useState('')
  const branchId = branch || String(context.data?.branches.find((b) => b.is_active)?.id ?? '')
  const [station, setStation] = useState('')
  const [history, setHistory] = useState(false)
  const [page, setPage] = useState(1)
  const [clock, setClock] = useState(Date.now())
  const [action, setAction] = useState<{ ticket: KitchenTicket; status: string } | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const stations = useQuery({
    queryKey: ['kitchen-stations', 'board', branchId],
    enabled: !!branchId,
    queryFn: () =>
      api<CatalogPage<{ id: number; name: string }>>(
        `kitchen-stations?branch_id=${branchId}&per_page=50`,
      ),
  })
  const query = useQuery({
    queryKey: ['kitchen-tickets', branchId, station, history, page],
    enabled: !!branchId,
    queryFn: () =>
      api<CatalogPage<KitchenTicket> & { server_now: string }>(
        `kitchen-tickets?branch_id=${branchId}&page=${page}&history=${history ? 1 : 0}${station ? '&station_id=' + station : ''}`,
      ),
    refetchInterval: 5000,
  })
  const serverClock = query.data?.server_now
    ? Date.parse(query.data.server_now) + clock - query.dataUpdatedAt
    : clock
  const columns: KitchenTicket['status'][] = history
    ? ['delivered', 'cancelled']
    : ['new', 'preparing', 'ready']
  return (
    <section className="kitchen-board" aria-label="Nexora Kitchen">
      <header className="kitchen-heading">
        <div className="kitchen-title">
          <span className="kitchen-title-icon">
            <ChefHat size={24} aria-hidden="true" />
          </span>
          <div>
            <span className="eyebrow">CENTRO DE PREPARACIÓN</span>
            <h1>Comandas de cocina</h1>
          </div>
        </div>
        <span className="kitchen-sync" data-error={!!query.error} role="status">
          <span className="kitchen-sync-dot" />
          {query.error
            ? 'Sin actualizar · reintenta'
            : query.isPending
              ? 'Cargando cocina…'
              : 'Actualización automática · cada 5 s'}
        </span>
        {can('kitchen.manage') && (
          <Link className="kitchen-config" to="/cocina/rutas">
            <Settings2 size={16} aria-hidden="true" />
            Configurar rutas
          </Link>
        )}
      </header>
      <div className="kitchen-toolbar">
        <select
          aria-label="Sucursal de cocina"
          value={branchId}
          onChange={(event) => {
            setBranch(event.target.value)
            setStation('')
            setPage(1)
          }}
        >
          <option value="" disabled>
            Sucursal
          </option>
          {context.data?.branches
            .filter((b) => b.is_active)
            .map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Estación de cocina"
          value={station}
          onChange={(event) => {
            setStation(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todas las estaciones</option>
          {stations.data?.data.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={history}
          onClick={() => {
            setHistory(!history)
            setPage(1)
          }}
        >
          <History size={16} aria-hidden="true" />
          {history ? 'Ver activas' : 'Ver historial'}
        </button>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={query.isFetching ? 'kitchen-refreshing' : ''}
          />
          Actualizar cocina
        </button>
      </div>
      <ErrorNotice error={context.error || stations.error || query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div
          className="kitchen-columns"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(230px, 1fr))` }}
        >
          {columns.map((status) => (
            <section key={status} className="kitchen-column" data-state={status}>
              <h2>
                <span className="kitchen-column-label">
                  {status === 'new' ? (
                    <Inbox size={19} aria-hidden="true" />
                  ) : status === 'preparing' ? (
                    <Flame size={19} aria-hidden="true" />
                  ) : (
                    <CheckCheck size={19} aria-hidden="true" />
                  )}
                  {labels[status]}
                </span>
                <span>{query.data?.data.filter((t) => t.status === status).length ?? 0}</span>
              </h2>
              <div className="kitchen-ticket-list">
                {!query.error && !query.data?.data.some((ticket) => ticket.status === status) && (
                  <div className="kitchen-empty">
                    <ChefHat size={32} aria-hidden="true" />
                    <strong>
                      {history
                        ? 'Sin comandas en esta página'
                        : status === 'new'
                          ? 'Todo recibido'
                          : status === 'preparing'
                            ? 'Sin preparaciones en curso'
                            : 'Sin entregas pendientes'}
                    </strong>
                    <span>
                      {history
                        ? 'Prueba otra estación o página.'
                        : 'Las comandas aparecerán aquí al cambiar de estado.'}
                    </span>
                  </div>
                )}
                {query.data?.data
                  .filter((ticket) => ticket.status === status)
                  .map((ticket) => (
                    <article
                      className="kitchen-ticket"
                      key={ticket.id}
                      data-overdue={
                        serverClock - Date.parse(ticket.created_at) >
                          ticket.target_minutes * 60000 &&
                        ['new', 'preparing'].includes(ticket.status)
                      }
                    >
                      <header>
                        <strong>
                          Pedido #{ticket.order_id} · Comanda #{ticket.id}
                        </strong>
                        <time aria-label="Tiempo transcurrido">
                          <Clock3 size={14} aria-hidden="true" />
                          {elapsed(ticket, serverClock)}
                        </time>
                      </header>
                      <p className="kitchen-station">
                        {ticket.station_name} · objetivo {ticket.target_minutes} min
                      </p>
                      <p className="kitchen-destination">
                        {ticket.order_snapshot.dining?.tables
                          ?.map((table) => table.name ?? table.table_name)
                          .join(' · ') ||
                          ticket.order_snapshot.reference ||
                          (ticket.order_snapshot.channel === 'dine_in'
                            ? 'En restaurante'
                            : 'Para llevar / domicilio')}
                      </p>
                      <ul>
                        {ticket.lines.map((line) => (
                          <li key={line.id}>
                            <strong className="kitchen-food">
                              <span className="kitchen-quantity">{line.quantity} ×</span>{' '}
                              <span>{line.product_name}</span>
                            </strong>
                            {line.variant_name && <small>{line.variant_name}</small>}
                            <span className="preparation-badge" data-destination={line.preparation_destination}>{preparationLabels[line.preparation_destination ?? 'table']}</span>
                            {line.corrections?.map(c=><p className="kitchen-note" key={c.id}>Corrección: {c.reason}</p>)}
                            {line.preparations?.map((group, i) => (
                              <small key={i}>
                                {group.name}: {group.options.join(', ')}
                              </small>
                            ))}
                            {line.notes && <p className="kitchen-note">{line.notes}</p>}
                          </li>
                        ))}
                      </ul>
                      {ticket.order_snapshot.notes && (
                        <p className="kitchen-note">{ticket.order_snapshot.notes}</p>
                      )}
                      {can('kitchen.operate') &&
                        ['new', 'preparing', 'ready'].includes(ticket.status) && (
                          <button
                            className="kitchen-advance"
                            disabled={!!action}
                            type="button"
                            onClick={() =>
                              setAction({
                                ticket: structuredClone(ticket),
                                status: {
                                  new: 'preparing',
                                  preparing: 'ready',
                                  ready: 'delivered',
                                }[ticket.status as 'new' | 'preparing' | 'ready'],
                              })
                            }
                          >
                            {ticket.status === 'new'
                              ? 'RECIBIR'
                              : ticket.status === 'preparing'
                                ? 'TERMINAR'
                                : 'ENTREGAR'}
                          </button>
                        )}
                      <details>
                        <summary>Historial de la comanda</summary>
                        {ticket.events?.map((event) => (
                          <p key={event.id}>
                            {labels[event.to_status as KitchenTicket['status']]} ·{' '}
                            {new Date(event.created_at).toLocaleTimeString('es-CO')}
                            {event.reason && ` · ${event.reason}`}
                          </p>
                        ))}
                      </details>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {query.data && (
        <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
      )}
      {action && <KitchenAction value={action} onClose={() => setAction(null)} />}
    </section>
  )
}
function elapsed(ticket: KitchenTicket, clock: number) {
  const ended =
    ticket.delivered_at ?? (ticket.status === 'cancelled' ? ticket.events.at(-1)?.created_at : null)
  const end = ended ? Date.parse(ended) : clock
  const seconds = Math.max(0, Math.floor((end - Date.parse(ticket.created_at)) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function KitchenAction({
  value,
  onClose,
}: {
  value: { ticket: KitchenTicket; status: string }
  onClose: () => void
}) {
  const client = useQueryClient()
  const started = useRef(false)
  const operation = useOperation(`kitchen-tickets/${value.ticket.id}/status`, async () => {
    await Promise.all(
      ['kitchen-tickets', 'orders', 'order', 'table-active-order'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    onClose()
  })
  useEffect(() => {
    if (started.current) return
    started.current = true
    operation.send({ revision: value.ticket.revision, status: value.status })
  }, []) // Snapshot inmutable al pulsar la acción.
  return (
    <div className="kitchen-action" role="region" aria-label="Actualizar comanda">
      <strong>Comanda #{value.ticket.id}</strong>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      {operation.isPending ? (
        <p>Guardando estado…</p>
      ) : (
        <div>
          <button disabled={operation.locked} onClick={onClose}>
            Volver
          </button>
          {operation.uncertain && (
            <button onClick={() => operation.send({})}>Reintentar mismo cambio</button>
          )}
        </div>
      )}
    </div>
  )
}
