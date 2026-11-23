import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bike,
  Plus,
  RefreshCw,
  Search,
  MapPin,
  UserRound,
  Clock3,
  ArrowUpRight,
  PackageCheck,
  X,
  SlidersHorizontal,
} from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, Modal, Field, Submit } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { deliveryLabels as labels, deliveryKitchenLabels, type Delivery } from './delivery-types'
import { DeliveryDetail } from './DeliveryDetail'
import { TerminalCheckout } from '../pos/TerminalCheckout'
import { useTerminalGuard } from '../pos/TerminalEnvironment'
import { KitchenSend } from '../kitchen/KitchenSend'
import { OrderCustomerEditor } from './OrderCustomerEditor'
import { OrderComposer } from './OrderComposer'
import type { Order } from '../operations/types'
import './deliveries.css'

const filters = [
  { value: '', label: 'Todos', icon: Bike },
  { value: 'pending', label: 'Por asignar', icon: UserRound },
  { value: 'assigned', label: 'Asignados', icon: PackageCheck },
  { value: 'out_for_delivery', label: 'En reparto', icon: ArrowUpRight },
  { value: 'delivered', label: 'Entregados', icon: PackageCheck },
  { value: 'cancelled', label: 'Cancelados', icon: X },
]
export function DeliveriesPage() {
  const can = useCan()
  const { session } = useSession()
  const context = useOperationContext()
  const client = useQueryClient()
  const [branch, setBranch] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checkout, setCheckout] = useState<number | null>(null)
  const [kitchen, setKitchen] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState<Order | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [action, setAction] = useState<{ delivery: Delivery; status: string } | null>(null)
  const busy = !!checkout || !!action || !!kitchen || !!editing
  useTerminalGuard(busy, busy)
  useEffect(() => {
    if (!busy) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [busy])
  const selected = branch ?? context.data?.branches.find((b) => b.is_active)?.id ?? null
  const query = useQuery({
    queryKey: ['deliveries', selected, status, page],
    enabled: !!selected && !busy && !adding,
    queryFn: ({ signal }) =>
      api<CatalogPage<Delivery>>(
        `deliveries?branch_id=${selected}&page=${page}${status ? '&status=' + status : ''}`,
        { signal },
      ),
    refetchInterval: busy || adding ? false : 10000,
  })
  const delivery = query.data?.data.find((row) => row.id === selectedId) ?? null
  const term = search.trim().toLocaleLowerCase()
  const rows = (query.data?.data ?? []).filter(
    (row) =>
      !term ||
      [row.order_id, row.recipient_name, row.phone, row.address, row.courier_name]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(term),
  )
  const time = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: session!.company.timezone,
    }).format(new Date(value))
  const refresh = () => {
    void query.refetch()
    if (delivery) void client.invalidateQueries({ queryKey: ['order', delivery.order_id] })
  }
  return (
    <section
      className="delivery-terminal"
      data-mode={adding ? 'edit' : checkout ? 'checkout' : 'board'}
      aria-label="Terminal de domicilios"
    >
      {adding ? (
        <OrderComposer
          key={adding.id}
          terminal
          initialOrder={adding}
          initialChannel="delivery"
          onReturn={() => {
            setAdding(null)
            void client.invalidateQueries({ queryKey: ['deliveries'] })
            void client.invalidateQueries({ queryKey: ['order', adding.id] })
          }}
        />
      ) : checkout ? (
        <TerminalCheckout
          orderId={checkout}
          onClose={() => {
            setCheckout(null)
            void client.invalidateQueries({ queryKey: ['deliveries'] })
            if (delivery) void client.invalidateQueries({ queryKey: ['order', delivery.order_id] })
          }}
        />
      ) : (
        <>
          <header className="delivery-toolbar">
            <div className="delivery-title">
              <span>
                <Bike size={24} aria-hidden="true" />
              </span>
              <div>
                <small>NEXORA TERMINAL</small>
                <h1>Domicilios</h1>
              </div>
            </div>
            <OperationalBranchPicker
              branches={context.data?.branches ?? []}
              value={selected}
              onChange={(id) => {
                setBranch(id)
                setPage(1)
                setSelectedId(null)
                setSearch('')
              }}
            />
            <div className="delivery-toolbar-actions">
              <button
                type="button"
                aria-label="Actualizar domicilios"
                disabled={query.isFetching || !selected}
                onClick={refresh}
              >
                <RefreshCw size={17} />
              </button>
              {can('deliveries.configure') && (
                <Link to="/terminal/domicilios/tarifas">
                  <SlidersHorizontal size={16} />
                  Tarifas
                </Link>
              )}
              {can('orders.manage') && can('catalog.view') && (
                <Link className="delivery-new" to="/terminal/domicilios/nuevo">
                  <Plus size={18} />
                  Nuevo domicilio
                </Link>
              )}
            </div>
          </header>
          <div className="delivery-filters" role="group" aria-label="Filtrar domicilios por estado">
            {filters.map(({ value, label, icon: Icon }) => (
              <button
                type="button"
                key={value}
                data-status={value || 'all'}
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value)
                  setPage(1)
                  setSelectedId(null)
                  setSearch('')
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <ErrorNotice error={query.error || context.error} />
          <div className="delivery-workspace" data-selected={!!delivery}>
            <section className="delivery-board" aria-label="Pedidos a domicilio">
              <header className="delivery-board-tools">
                <label>
                  <Search size={17} />
                  <input
                    aria-label="Buscar entre los domicilios de esta página"
                    placeholder="Cliente, teléfono o pedido de esta página…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setSelectedId(null)
                    }}
                  />
                </label>
                <span>
                  {query.data
                    ? `${query.data.meta.total} registros · ${filters.find((f) => f.value === status)?.label}`
                    : 'Consultando…'}
                </span>
              </header>
              <div className="delivery-grid">
                {query.isPending && <Loading />}
                {!query.isPending && !rows.length && (
                  <div className="delivery-empty">
                    <Bike size={38} />
                    <h2>
                      {term ? 'Sin coincidencias en esta página' : 'Sin domicilios en este estado'}
                    </h2>
                    <p>
                      {term
                        ? 'Prueba otro nombre o consulta otra página.'
                        : 'Los pedidos registrados aparecerán aquí.'}
                    </p>
                    {term && (
                      <button type="button" onClick={() => setSearch('')}>
                        Limpiar búsqueda
                      </button>
                    )}
                  </div>
                )}
                {rows.map((row) => (
                  <button
                    type="button"
                    className="delivery-tile"
                    data-status={row.status}
                    key={row.id}
                    aria-pressed={selectedId === row.id}
                    aria-label={`Ver domicilio de ${row.recipient_name}, pedido #${row.order_id}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <div className="delivery-tile-top">
                      <b>#{row.order_id}</b>
                      <span className="delivery-state">{labels[row.status]}</span>
                    </div>
                    <strong className="delivery-tile-name">{row.recipient_name}</strong>
                    <span className="delivery-tile-address">
                      <MapPin size={14} />
                      {row.address}
                    </span>
                    <span className="delivery-tile-courier">
                      <UserRound size={14} />
                      {row.courier_name ?? 'Sin repartidor asignado'}
                    </span>
                    <div className="delivery-tile-bottom">
                      <span>{deliveryKitchenLabels[row.preparation_status]}</span>
                      <time dateTime={row.created_at}>
                        <Clock3 size={12} />
                        {time(row.created_at)}
                      </time>
                    </div>
                  </button>
                ))}
              </div>
              {query.data && (
                <Pagination
                  meta={query.data.meta}
                  pending={query.isFetching}
                  onPage={(next) => {
                    setPage(next)
                    setSelectedId(null)
                    setSearch('')
                  }}
                />
              )}
            </section>
            <DeliveryDetail
              onAdd={(order) => setAdding(structuredClone(order))}
              delivery={delivery}
              onBack={() => setSelectedId(null)}
              onAction={(status) => {
                if (delivery) setAction({ delivery: structuredClone(delivery), status })
              }}
              onCollect={() => {
                if (delivery) setCheckout(delivery.order_id)
              }}
              onKitchen={() => {
                if (delivery) setKitchen(delivery.order_id)
              }}
              onEdit={() => {
                if (delivery) setEditing(delivery.order_id)
              }}
            />
          </div>
          <footer className="delivery-board-footer">
            <span>Entrega y cobro son operaciones independientes</span>
            <span>
              <Clock3 size={12} />
              Consulta automática cada 10 s
            </span>
          </footer>
        </>
      )}
      {action && <DeliveryAction value={action} onClose={() => setAction(null)} />}
      {kitchen && (
        <KitchenSend
          orderId={kitchen}
          onClose={() => {
            setKitchen(null)
            refresh()
          }}
        />
      )}
      {editing && (
        <Modal
          title="Cliente del domicilio"
          className="modal delivery-customer-modal"
          onClose={() => setEditing(null)}
          locked={editorBusy}
        >
          <OrderCustomerEditor
            orderId={editing}
            onClose={() => setEditing(null)}
            onBusy={setEditorBusy}
          />
        </Modal>
      )}
    </section>
  )
}

function DeliveryAction({
  value,
  onClose,
}: {
  value: { delivery: Delivery; status: string }
  onClose: () => void
}) {
  const client = useQueryClient()
  const couriers = useQuery({
    queryKey: ['couriers', value.delivery.branch_id],
    enabled: value.status === 'assigned',
    queryFn: () =>
      api<{ data: { id: number; name: string }[] }>(
        `deliveries/couriers?branch_id=${value.delivery.branch_id}`,
      ),
  })
  const operation = useOperation(`deliveries/${value.delivery.id}/status`, async () => {
    await client.invalidateQueries({ queryKey: ['deliveries'] })
    onClose()
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    operation.send({
      revision: value.delivery.revision,
      status: value.status,
      ...(value.status === 'assigned' ? { courier_id: Number(f.get('courier_id')) } : {}),
      reason: f.get('reason') || null,
    })
  }
  return (
    <Modal
      title={
        value.status === 'assigned'
          ? 'Asignar repartidor'
          : value.status === 'out_for_delivery'
            ? 'Confirmar salida a reparto'
            : 'Confirmar entrega al cliente'
      }
      onClose={onClose}
      locked={operation.locked}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || couriers.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          {value.status === 'assigned' && (
            <Field label="Repartidor autorizado">
              <select name="courier_id" required defaultValue={value.delivery.courier_id ?? ''}>
                <option value="" disabled>
                  Selecciona un empleado
                </option>
                {couriers.data?.data.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Observación de entrega">
            <textarea name="reason" maxLength={250} />
          </Field>
        </fieldset>
        {operation.uncertain ? (
          <button type="button" className="button primary" onClick={() => operation.send({})}>
            Reintentar mismo cambio
          </button>
        ) : (
          <Submit pending={operation.isPending}>Confirmar estado de entrega</Submit>
        )}
      </form>
    </Modal>
  )
}
