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
import { ErrorNotice, Loading, Modal, Field } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { KitchenTicket } from './types'
import { TicketPrintButton } from '../orders/OrderPrintActions'
import './kitchen.css'
import { usePublishedOperationalLayout } from '../studio/usePublishedOperationalLayout'
import {
  defaultKitchenLayout,
  parseKitchenLayout,
  kitchenStyle,
  type KitchenLayout,
} from '../studio/kitchen-layout'
import '../studio/kitchen-layout.css'
import { preparationLabels } from './TableKitchen'
import { useKitchenRealtime } from './useKitchenRealtime'
import { useTerminalGuard } from '../pos/TerminalEnvironment'
const labels = {
  new: 'Nuevas',
  preparing: 'En preparación',
  ready: 'Terminadas',
  delivered: 'Entregadas',
  cancelled: 'Canceladas',
}
export function KitchenBoardPage({ studioPreview }: { studioPreview?: KitchenLayout }) {
  const context = useOperationContext()
  const can = useCan()
  const { screenBlocked, session } = useSession()
  const [branch, setBranch] = useState('')
  const branchId = branch || String(context.data?.branches.find((b) => b.is_active)?.id ?? '')
  const realtime = useKitchenRealtime(branchId, !!studioPreview)
  const [station, setStation] = useState('')
  const [history, setHistory] = useState(false)
  const [page, setPage] = useState(1)
  const [clock, setClock] = useState(Date.now())
  const [action, setAction] = useState<{ ticket: KitchenTicket; status: string } | null>(null)
  const [priority, setPriority] = useState<KitchenTicket | null>(null)
  const layout = usePublishedOperationalLayout(
    'kitchen',
    'kitchen.view',
    parseKitchenLayout,
    defaultKitchenLayout,
    true,
    !!action || !!priority,
    studioPreview,
  )
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const stations = useQuery({
    queryKey: ['kitchen-stations', 'board', branchId],
    enabled: !!branchId && !screenBlocked,
    queryFn: () =>
      api<CatalogPage<{ id: number; name: string }>>(
        `kitchen-stations?branch_id=${branchId}&per_page=50`,
      ),
  })
  const query = useQuery({
    queryKey: ['kitchen-tickets', branchId, station, history, page],
    enabled: !!branchId && !screenBlocked,
    queryFn: () =>
      api<
        CatalogPage<KitchenTicket> & {
          server_now: string
          recent_changes?: {
            id: number
            order_id: number
            product_name: string
            quantity: number
            reason: string
            corrected: boolean
          }[]
        }
      >(
        `kitchen-tickets?branch_id=${branchId}&page=${page}&history=${history ? 1 : 0}${station ? '&station_id=' + station : ''}`,
      ),
    refetchInterval: studioPreview ? false : 5000,
  })
  const serverClock = query.data?.server_now
    ? Date.parse(query.data.server_now) + clock - query.dataUpdatedAt
    : clock
  const columns: KitchenTicket['status'][] = history
    ? ['delivered', 'cancelled']
    : ['new', 'preparing', 'ready']
  return (
    <section
      className="kitchen-board"
      aria-label="Nexora Kitchen"
      data-studio-kitchen={!!layout}
      style={layout ? kitchenStyle(layout) : undefined}
    >
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
              : studioPreview
                ? 'Vista previa · sin actualización automática'
                : realtime
                  ? 'Canal privado conectado · respaldo cada 5 s'
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
      {!!query.data?.recent_changes?.length && (
        <section className="kitchen-changes" aria-label="Cambios recientes de productos">
          <strong>Correcciones y anulaciones · últimos 30 min</strong>
          <div>
            {query.data.recent_changes.map((change) => (
              <p key={change.id}>
                Pedido #{change.order_id} · {change.quantity} × {change.product_name} ·{' '}
                <b>{change.corrected ? 'CORREGIDO' : 'ANULADO'}</b> · {change.reason}
              </p>
            ))}
          </div>
        </section>
      )}
      {query.isPending ? (
        <Loading />
      ) : (
        <div
          className="kitchen-columns"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(${layout?.tokens.column_width ?? 230}px, 1fr))`,
          }}
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
                      data-urgent={ticket.priority === 1}
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
                      <div className="kitchen-signals">
                        {ticket.priority === 1 && (
                          <strong className="kitchen-urgent">URGENTE</strong>
                        )}
                        {['new', 'preparing'].includes(ticket.status) &&
                          serverClock - Date.parse(ticket.created_at) >
                            ticket.target_minutes * 60000 && (
                            <strong className="kitchen-delay">
                              Demora +
                              {duration(
                                serverClock -
                                  Date.parse(ticket.created_at) -
                                  ticket.target_minutes * 60000,
                              )}
                            </strong>
                          )}
                        {ticket.ready_at && (
                          <span>
                            Hasta lista:{' '}
                            {duration(Date.parse(ticket.ready_at) - Date.parse(ticket.created_at))}
                          </span>
                        )}
                      </div>
                      <p className="kitchen-destination">
                        {ticket.order_snapshot.dining?.tables
                          ?.map((table) => table.name ?? table.table_name)
                          .join(' · ') ||
                          ticket.order_snapshot.reference ||
                          (ticket.order_snapshot.channel === 'dine_in'
                            ? 'En restaurante'
                            : ticket.order_snapshot.channel === 'delivery'
                              ? 'Domicilio'
                              : 'Recogida en mostrador')}
                      </p>
                      <ul>
                        {ticket.lines.map((line) => (
                          <li key={line.id} data-annulled={!!line.item_change}>
                            <strong className="kitchen-food">
                              <span className="kitchen-quantity">{line.quantity} ×</span>{' '}
                              <span>{line.product_name}</span>
                            </strong>
                            {line.variant_name && <small>{line.variant_name}</small>}
                            {line.item_change && (
                              <p className="kitchen-note">
                                <b>
                                  {line.item_change.replacement_item_id
                                    ? 'REEMPLAZADO · NO PREPARAR ESTA LÍNEA'
                                    : 'ANULADO · NO PREPARAR'}
                                </b>{' '}
                                · {line.item_change.reason}
                              </p>
                            )}
                            <span
                              className="preparation-badge"
                              data-destination={line.preparation_destination}
                            >
                              {preparationLabels[line.preparation_destination ?? 'table']}
                            </span>
                            {line.corrections?.map((c) => (
                              <p className="kitchen-note" key={c.id}>
                                Corrección: {c.reason}
                              </p>
                            ))}
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
                            disabled={!!action || !!priority}
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
                      <TicketPrintButton ticket={ticket} />
                      {can('kitchen.operate') &&
                        ['new', 'preparing', 'ready'].includes(ticket.status) && (
                          <button
                            className="kitchen-priority-button"
                            type="button"
                            disabled={!!action || !!priority}
                            onClick={() => setPriority(structuredClone(ticket))}
                          >
                            {ticket.priority === 1 ? 'Quitar urgente' : 'Marcar urgente'}
                          </button>
                        )}
                      <details>
                        <summary>Historial de la comanda</summary>
                        {ticket.events?.map((event) => (
                          <p key={event.id}>
                            {labels[event.to_status as KitchenTicket['status']]} ·{' '}
                            {new Date(event.created_at).toLocaleString('es-CO', {
                              timeZone: session?.company.timezone ?? 'America/Bogota',
                            })}
                            {event.reason && ` · ${event.reason}`}
                            {event.actor && ` · ${event.actor.name}`}
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
      {priority && <KitchenPriority ticket={priority} onClose={() => setPriority(null)} />}
    </section>
  )
}
function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function KitchenPriority({ ticket, onClose }: { ticket: KitchenTicket; onClose: () => void }) {
  const client = useQueryClient()
  const [reason, setReason] = useState('')
  const operation = useOperation(`kitchen-tickets/${ticket.id}/priority`, async () => {
    await Promise.all(
      ['kitchen-tickets', 'table-kitchen'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    onClose()
  })
  useTerminalGuard(operation.locked, operation.locked)
  return (
    <Modal
      title={ticket.priority === 1 ? 'Quitar prioridad urgente' : 'Marcar comanda urgente'}
      locked={operation.locked}
      onClose={onClose}
    >
      <p>
        Comanda #{ticket.id} · Pedido #{ticket.order_id}. El cambio quedará registrado en el
        historial.
      </p>
      <Field label="Motivo de prioridad">
        <textarea
          value={reason}
          minLength={3}
          maxLength={200}
          disabled={operation.locked}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="form-actions">
        <button disabled={operation.locked} onClick={onClose}>
          Volver
        </button>
        <button
          className="button primary"
          disabled={operation.isPending || (!operation.uncertain && reason.trim().length < 3)}
          onClick={() =>
            operation.send({
              revision: ticket.revision,
              priority: ticket.priority === 1 ? 0 : 1,
              reason: reason.trim(),
            })
          }
        >
          {operation.uncertain ? 'Reintentar misma prioridad' : 'Confirmar prioridad'}
        </button>
      </div>
    </Modal>
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
