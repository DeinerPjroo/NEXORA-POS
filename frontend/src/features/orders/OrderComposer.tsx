import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading, PageTitle, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CategoryPicker } from '../catalog/CategoryPicker'
import { CatalogEmpty, CatalogError, Pagination, useDebounce } from '../catalog/catalog-ui'
import type { CatalogPage, CategorySummary, Product, Variant } from '../catalog/types'
import { categoryPath } from '../catalog/types'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { Order } from '../operations/types'
import { VariantOrderPicker } from './VariantOrderPicker'
import { ModifierOrderPicker } from './ModifierOrderPicker'
import { ModifierDetails } from './ModifierDetails'
import { cartSubtotal, contextualPrice, makeLine, serializeCart } from './cart'
import type { CartLine, CartConfiguration } from './cart'
import type { OrderChannel } from '../catalog/context-price-types'
import { useCartPricing } from './useCartPricing'
import { PriceDetails } from './PriceDetails'
import { CartComboDetails } from './CartComboDetails'
import type { CashOption, SalesSettings } from '../sales/types'
import { PosCategories, PosKeypad, defaultPosLayout } from '../pos/PosPanels'
import '../pos/terminal.css'
import { loadPosContext, savePosContext } from '../pos/pos-context'
import { TableOrders } from '../dining/TableOrders'
import type { DiningSession } from '../dining/session-types'
import type { DiningSelection } from '../dining/session-types'
import { PosOrderLines } from '../pos/PosOrderLines'
import '../pos/digital-order.css'
import { PosTablesPanel } from '../dining/PosTablesPanel'

const DiningSessionPicker = lazy(() =>
  import('../dining/DiningSessionPicker').then((module) => ({
    default: module.DiningSessionPicker,
  })),
)

const PriceReviewModal = lazy(() =>
  import('./PriceReviewModal').then((module) => ({ default: module.PriceReviewModal })),
)
const ComboOrderPicker = lazy(() =>
  import('./ComboOrderPicker').then((module) => ({ default: module.ComboOrderPicker })),
)

export function OrderComposer({
  terminal = false,
  initialDining,
}: {
  terminal?: boolean
  initialDining?: DiningSelection
}) {
  const context = useOperationContext(terminal)
  const { session } = useSession()
  const [currency] = useState(session!.company.currency)
  const [remembered] = useState(() =>
    terminal ? loadPosContext(session!) : { branchId: null, channel: 'takeaway' as OrderChannel },
  )
  const [branch, setBranch] = useState<number | null>(
    initialDining?.branch_id ?? remembered.branchId,
  )
  const [channel, setChannel] = useState<OrderChannel>(
    initialDining ? 'dine_in' : remembered.channel,
  )
  const [dining, setDining] = useState<DiningSelection | null>(initialDining ?? null)
  const [details, setDetails] = useState(false)
  const [tablesOpen, setTablesOpen] = useState(false)
  const pendingDining = useRef<DiningSelection | null>(null)
  const pendingTableSwitch = useRef<DiningSelection | null>(null)
  const orderIntent = useRef<'save' | 'checkout'>('checkout')
  const orderForm = useRef<HTMLFormElement>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [photos, setPhotos] = useState(false)
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const terminalRoot = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<'menu' | 'cart'>('menu')
  const searchInput = useRef<HTMLInputElement>(null)
  const submitButton = useRef<HTMLButtonElement>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategorySummary | null>(null)
  const [page, setPage] = useState(1)
  const [picking, setPicking] = useState<Product | null>(null)
  const [bundling, setBundling] = useState<Product | null>(null)
  const [customizing, setCustomizing] = useState<{ product: Product; variant?: Variant } | null>(
    null,
  )
  const [cart, setCart] = useState<CartLine[]>([])
  useEffect(() => {
    if (!terminal) return
    document.body.classList.add('pos-active')
    return () => document.body.classList.remove('pos-active')
  }, [terminal])
  const can = useCan()
  const navigate = useNavigate()
  const client = useQueryClient()
  const toast = useToast()
  const text = useDebounce(search)
  const activeBranches = context.data?.branches.filter((item) => item.is_active) ?? []
  const selected =
    branch === null
      ? (activeBranches[0]?.id ?? null)
      : (activeBranches.find((item) => item.id === branch)?.id ?? null)
  const posCash = useQuery({
    queryKey: ['pos-cash', selected],
    queryFn: ({ signal }) =>
      api<{ data: CashOption[] }>(`sales/cash-context?branch_id=${selected}`, { signal }),
    enabled: terminal && !!selected && can('sales.collect'),
    refetchInterval: terminal ? 15000 : false,
  })
  const posSettings = useQuery({
    queryKey: ['sales-settings'],
    queryFn: ({ signal }) => api<{ data: SalesSettings }>('sales/settings', { signal }),
    enabled: terminal && can('sales.collect'),
    refetchInterval: terminal ? 15000 : false,
  })
  const posReady =
    !terminal ||
    (!!posSettings.data?.data.configured &&
      !!posCash.data?.data.some((cash) => cash.currency === currency))
  const params = new URLSearchParams({
    status: 'active',
    availability: 'available',
    page: String(page),
    per_page: '12',
  })
  if (text) params.set('search', text)
  if (category) params.set('category_id', String(category.id))
  if (selected) {
    params.set('branch_id', String(selected))
    params.set('channel', channel)
  }
  const products = useQuery({
    queryKey: ['products', 'order-menu', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Product>>(`products?${params}`, { signal }),
    enabled: can('catalog.view') && !!selected,
    refetchInterval: 30_000,
  })
  const activeTableOrder = useQuery({
    queryKey: ['table-active-order', dining?.id],
    queryFn: ({ signal }) =>
      api<CatalogPage<Order> & { session_revision: number }>(
        `dining-sessions/${dining!.id}/orders?pending=1&per_page=1`,
        {
          signal,
        },
      ),
    enabled: terminal && !!dining && channel === 'dine_in',
    refetchInterval: 15000,
  })
  const tableOrderUnavailable =
    terminal && !!dining && (activeTableOrder.isPending || !!activeTableOrder.error)
  const operation = useOperation<Order>('orders', async (order) => {
    await client.invalidateQueries({ queryKey: ['orders'] })
    if (order.dining_session_id) await client.invalidateQueries({ queryKey: ['dining-occupancy'] })
    if (order.dining_session_id)
      await client.invalidateQueries({ queryKey: ['table-active-order', order.dining_session_id] })
    if (orderIntent.current === 'save' && order.dining_session_id) {
      const fresh = await api<{ data: DiningSession }>('dining-sessions/' + order.dining_session_id)
      await client.invalidateQueries({ queryKey: ['table-orders', order.dining_session_id] })
      setCart([])
      setActiveLine(null)
      const next = pendingTableSwitch.current
      pendingTableSwitch.current = null
      if (next) {
        orderForm.current?.reset()
        setDining(next)
        setBranch(next.branch_id)
        setChannel('dine_in')
      } else
        setDining((current) =>
          current?.id === fresh.data.id ? { ...current, revision: fresh.data.revision } : current,
        )
      toast('Pedido guardado en su mesa.')
      return
    }
    toast(
      terminal
        ? 'Pedido registrado. Revisa y confirma el cobro.'
        : 'Pedido registrado. No se ha realizado ningún cobro.',
    )
    if (terminal) navigate(`/pos/pedidos/${order.id}/cobrar`)
    else if (can('orders.view')) navigate(`/pedidos/${order.id}`)
    else {
      setCart([])
    }
  })
  const pricing = useCartPricing({
    cart,
    currency,
    locked: operation.locked,
    onApply: (lines, target) => {
      setCart(lines)
      setBranch(target.branchId)
      setChannel(target.channel)
      if (
        pendingDining.current &&
        target.channel === 'dine_in' &&
        target.branchId === pendingDining.current.branch_id
      ) {
        setDining(pendingDining.current)
        pendingDining.current = null
      } else if (target.channel !== 'dine_in' || target.branchId !== dining?.branch_id)
        setDining(null)
      operation.reset()
      void client.invalidateQueries({ queryKey: ['products', 'order-menu'] })
    },
  })
  const locked = operation.locked || pricing.locked
  useEffect(() => {
    if (pricing.error) pendingDining.current = null
  }, [pricing.error])
  useEffect(() => {
    if (terminal && selected && !locked) savePosContext(session!, selected, channel)
  }, [terminal, selected, channel, locked, session])
  useEffect(() => {
    if (!terminal) return
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        picking ||
        bundling ||
        customizing ||
        pricing.review
      )
        return
      if (event.key === 'F2') {
        event.preventDefault()
        setPanel('menu')
        requestAnimationFrame(() => searchInput.current?.focus())
      }
      if (event.key === 'F8') {
        event.preventDefault()
        setPanel('cart')
        requestAnimationFrame(() => submitButton.current?.focus())
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [terminal, picking, bundling, customizing, pricing.review])
  function configure(product: Product, variant?: Variant) {
    setPicking(null)
    if (product.modifier_groups_count) setCustomizing({ product, variant })
    else add(product, variant)
  }
  function add(product: Product, variant?: Variant, configuration?: CartConfiguration) {
    if (locked) return
    const line = makeLine(product, variant, configuration)
    addLine(line)
  }
  function addLine(line: CartLine) {
    if (locked) return
    setCart((previous) => {
      const existing = previous.find((item) => item.key === line.key)
      return existing
        ? previous.map((item) =>
            item.key === line.key ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item,
          )
        : [...previous, line]
    })
    setPicking(null)
    setCustomizing(null)
    setBundling(null)
  }
  function quantity(key: string, value: number) {
    if (!locked)
      setCart((previous) =>
        previous.map((line) =>
          line.key === key ? { ...line, quantity: Math.max(1, Math.min(999, value)) } : line,
        ),
      )
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (
      !selected ||
      !cart.length ||
      pricing.locked ||
      tableOrderUnavailable ||
      (orderIntent.current === 'checkout' && !posReady)
    )
      return
    const data = Object.fromEntries(new FormData(event.currentTarget))
    operation.send({
      ...data,
      branch_id: selected,
      channel,
      currency,
      items: serializeCart(cart, true),
      ...(terminal && dining && activeTableOrder.data?.data[0]
        ? {
            append_order_id: activeTableOrder.data.data[0].id,
            order_revision: activeTableOrder.data.data[0].revision,
          }
        : {}),
      ...(dining && dining.branch_id === selected && channel === 'dine_in'
        ? {
            dining_session_id: dining.id,
            dining_session_revision: terminal
              ? (activeTableOrder.data?.session_revision ?? dining.revision)
              : dining.revision,
          }
        : {}),
    })
  }
  if (!can('catalog.view'))
    return (
      <div className="empty-state">
        <ShoppingBag size={32} />
        <h1>Necesitas consultar el catálogo.</h1>
        <p>Tu administrador debe habilitar Consultar catálogo para tomar pedidos.</p>
      </div>
    )
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  return (
    <div
      className={terminal ? 'pos-terminal' : undefined}
      data-pos-panel={panel}
      data-photos={photos}
      data-layout-version={defaultPosLayout.schemaVersion}
      ref={terminalRoot}
    >
      {terminal && (
        <header className="pos-topbar" data-pos-slot="header">
          <strong>
            NEXORA <em>POS</em>
          </strong>
          <span className="pos-ready">
            {posReady ? '● Caja abierta' : '● Revisar caja/configuración'}
          </span>
          <OperationalBranchPicker
            branches={activeBranches}
            value={selected}
            onChange={(branchId) => pricing.request({ branchId, channel })}
            disabled={locked}
          />
          <span className="pos-employee">{session!.user.name}</span>
          <button
            type="button"
            onClick={() => setStatusOpen(!statusOpen)}
            aria-expanded={statusOpen}
          >
            Caja
          </button>
          <button
            type="button"
            aria-label="Actualizar estado del terminal"
            disabled={locked}
            onClick={() => {
              void context.refetch()
              if (selected) void posCash.refetch()
              void posSettings.refetch()
            }}
          >
            ↻
          </button>
          <button
            type="button"
            aria-label="Mostrar fotografías"
            aria-pressed={photos}
            onClick={() => setPhotos(!photos)}
          >
            Fotos
          </button>
          <button
            type="button"
            aria-label="Pantalla completa"
            onClick={() => {
              const request = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen()
              void request.catch(() => toast('Pantalla completa no disponible en este navegador.'))
            }}
          >
            ⛶
          </button>
          <Link to="/inicio" aria-label="Salir del terminal">
            Salir
          </Link>
        </header>
      )}
      <Link className="text-button product-back" to="/pedidos">
        <ArrowLeft size={16} />
        Volver a pedidos
      </Link>
      <PageTitle
        eyebrow={terminal ? 'LISTO PARA ATENDER' : 'CADA PEDIDO EMPIEZA AQUÍ'}
        title={terminal ? 'Terminal POS' : 'Tomar pedido'}
        description={
          terminal
            ? 'Elige productos, registra el pedido y confirma el cobro.'
            : 'Elige, personaliza las observaciones y envía. Todo queda registrado.'
        }
      />
      <ErrorNotice error={context.error} />
      {terminal && branch !== null && !selected && context.data && !context.isFetching && (
        <p className="notice">
          La sucursal recordada ya no está disponible. Elige otra sucursal para continuar.
        </p>
      )}
      {terminal && (
        <section
          className="pos-status panel"
          aria-label="Estado del terminal"
          data-open={statusOpen}
        >
          <ErrorNotice error={posCash.error || posSettings.error} />
          <div className="panel-heading">
            <strong>
              {!selected
                ? activeBranches.length
                  ? 'Elige una sucursal para operar'
                  : 'No hay sucursales activas'
                : posCash.isPending || posSettings.isPending
                  ? 'Consultando caja y configuración…'
                  : posReady
                    ? `${posCash.data!.data.length} ${posCash.data!.data.length === 1 ? 'caja abierta' : 'cajas abiertas'} · Configuración confirmada`
                    : 'Terminal pendiente de preparación'}
            </strong>
            <button
              className="text-button"
              disabled={
                operation.isPending ||
                pricing.locked ||
                context.isFetching ||
                posCash.isFetching ||
                posSettings.isFetching
              }
              onClick={() => {
                void context.refetch()
                if (selected) void posCash.refetch()
                void posSettings.refetch()
              }}
            >
              Actualizar estado del terminal
            </button>
          </div>
          {!posCash.isPending && !posCash.data?.data.length && (
            <p>
              Abre una caja de esta sucursal para iniciar el cobro.{' '}
              {can('cash.view') ? (
                <Link to="/caja" target="_blank" rel="noopener noreferrer">
                  Abrir caja en otra pestaña
                </Link>
              ) : (
                'Solicita la apertura a una persona autorizada.'
              )}
            </p>
          )}
          {!posSettings.isPending && !posSettings.data?.data.configured && (
            <p>
              La empresa debe confirmar el cálculo de ventas.{' '}
              {can('sales.configure') ? (
                <Link to="/ventas/configuracion" target="_blank" rel="noopener noreferrer">
                  Configurar ventas en otra pestaña
                </Link>
              ) : (
                'Solicita la configuración a una persona autorizada.'
              )}
            </p>
          )}
        </section>
      )}
      <div className="operation-toolbar">
        <OperationalBranchPicker
          branches={activeBranches}
          value={selected}
          onChange={(branchId) => pricing.request({ branchId, channel })}
          disabled={locked}
        />
        <span className="pill neutral">Sin cobro registrado</span>
      </div>
      <div className="order-composer">
        {terminal && (
          <>
            <aside className="pos-actions" data-pos-slot="actions">
              <button
                type="button"
                disabled={
                  locked ||
                  (tableOrderUnavailable && !!cart.length) ||
                  !selected ||
                  !can('dining.view') ||
                  !can('dining.operate')
                }
                title={
                  !can('dining.view') || !can('dining.operate')
                    ? 'Necesitas permisos para consultar y operar mesas'
                    : 'Seleccionar una mesa de esta sucursal'
                }
                onClick={() => {
                  setTablesOpen((value) => !value)
                  setPanel('cart')
                }}
              >
                Mesas
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setTablesOpen(false)
                  setDetails(true)
                  setPanel('cart')
                }}
              >
                Cliente
              </button>
              <Link to="/pedidos" target="_blank" rel="noopener noreferrer">
                Pedidos
              </Link>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setTablesOpen(false)
                  setDetails(true)
                  setPanel('cart')
                }}
              >
                Nota
              </button>
              <button
                type="button"
                disabled
                title="Los descuentos se aplican en la confirmación del cobro"
              >
                Descuento
              </button>
              <button type="button" onClick={() => window.print()}>
                Imprimir borrador
              </button>
              <button
                type="button"
                className="pos-cancel"
                disabled={locked || !cart.length}
                onClick={() => {
                  if (window.confirm('¿Descartar este pedido sin registrar?')) {
                    setCart([])
                    setActiveLine(null)
                  }
                }}
              >
                Cancelar
              </button>
            </aside>
            <PosCategories
              value={category}
              disabled={locked}
              onChange={(value) => {
                setCategory(value)
                setPage(1)
              }}
            />
          </>
        )}

        {terminal && (
          <div className="pos-view-switch" role="group" aria-label="Panel del terminal">
            <button
              type="button"
              className={`button ${panel === 'menu' ? 'primary' : 'secondary'}`}
              aria-pressed={panel === 'menu'}
              aria-label="Ver menú POS"
              onClick={() => setPanel('menu')}
            >
              Menú
            </button>
            <button
              type="button"
              className={`button ${panel === 'cart' ? 'primary' : 'secondary'}`}
              aria-pressed={panel === 'cart'}
              aria-label="Ver pedido POS"
              onClick={() => setPanel('cart')}
            >
              Pedido ({cart.reduce((sum, line) => sum + line.quantity, 0)})
            </button>
          </div>
        )}
        <section className="order-menu" data-pos-slot="products">
          {terminal && (
            <p className="muted small pos-shortcuts">
              F2: buscar · F8: ir al pedido. El cobro siempre requiere confirmación.
            </p>
          )}
          <div className="catalog-toolbar">
            <div className="search-input">
              <Search size={17} />
              <input
                ref={searchInput}
                aria-label="Buscar en el menú"
                placeholder="Busca producto o código…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            <CategoryPicker
              value={category}
              onChange={(value) => {
                setCategory(value)
                setPage(1)
              }}
              allowAll
            />
          </div>
          {category && !category.parent_id && (
            <p className="muted small">Esta categoría principal incluye sus subcategorías.</p>
          )}
          {!selected && !context.isPending ? (
            <p className="notice">Elige una sucursal activa para abrir el menú.</p>
          ) : products.error ? (
            <CatalogError error={products.error} onRetry={() => void products.refetch()} />
          ) : products.isPending ? (
            <Loading />
          ) : (
            <>
              {products.data.data.length ? (
                <div className="order-menu-grid">
                  {products.data.data.map((product) => (
                    <button
                      className={`panel order-product${product.availability_context?.allowed === false ? ' schedule-closed' : ''}`}
                      key={product.id}
                      disabled={!product.sellable || locked || products.isFetching || !posReady}
                      onClick={() =>
                        product.kind === 'combo'
                          ? setBundling(product)
                          : product.variants_count > 0
                            ? setPicking(product)
                            : configure(product)
                      }
                      aria-label={`Agregar ${product.name}`}
                    >
                      <span className="order-product-image">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" />
                        ) : (
                          <UtensilsCrossed size={29} strokeWidth={1.3} />
                        )}
                      </span>
                      <strong>{product.name}</strong>
                      {product.price_context?.promotion && (
                        <small>Promoción: {product.price_context.promotion.name}</small>
                      )}
                      <small>
                        {product.kind === 'combo' && product.combo_context?.reason
                          ? product.combo_context.reason
                          : product.availability_context?.allowed === false
                            ? `${product.availability_context.reason} · ${product.availability_context.timezone}`
                            : product.variants_count
                              ? `${product.available_variants_count} presentaciones disponibles`
                              : categoryPath(product.category)}
                      </small>
                      <span>
                        {product.kind === 'combo'
                          ? 'Configurar combo'
                          : product.variants_count
                            ? 'Elegir presentación'
                            : product.modifier_groups_count
                              ? 'Personalizar opciones'
                              : formatMoney(contextualPrice(product), currency)}
                        <Plus size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <CatalogEmpty filtered={Boolean(text || category)} />
              )}
              <Pagination
                meta={products.data.meta}
                onPage={setPage}
                pending={products.isFetching}
              />
            </>
          )}
          {terminal && (
            <PosKeypad
              disabled={locked || !cart.length}
              label={
                cart.find((line) => line.key === activeLine)?.product_name ??
                cart.at(-1)?.product_name ??
                'Cantidad'
              }
              onApply={(value) => {
                const line = cart.find((item) => item.key === activeLine) ?? cart.at(-1)
                if (line) quantity(line.key, value)
              }}
            />
          )}
        </section>
        <div
          className={terminal ? 'pos-order-workspace' : 'order-workspace'}
          data-view={terminal && tablesOpen ? 'tables' : 'order'}
        >
          <form
            className="panel order-cart"
            onSubmit={submit}
            ref={orderForm}
            data-pos-slot="order"
            inert={terminal && tablesOpen}
            aria-hidden={terminal && tablesOpen ? true : undefined}
          >
            <div className="panel-heading">
              <div className="pos-digital-heading-text">
                {terminal && <span className="pos-digital-eyebrow">CONTROL DE PEDIDO</span>}
                <h2>
                  {!terminal && <ShoppingBag size={19} />}
                  {terminal ? 'Pedido en curso' : 'Tu pedido'}
                </h2>
              </div>
              <span className="pill neutral">
                {cart.reduce((total, line) => total + line.quantity, 0)}{' '}
                {terminal ? 'nuevas' : 'unidades'}
              </span>
            </div>
            <ErrorNotice error={operation.error} />
            <ErrorNotice error={pricing.error} />
            {pricing.pending && (
              <p className="notice">Consultando precios actuales sin registrar el pedido…</p>
            )}
            <OperationNotice uncertain={operation.uncertain} />
            {dining && channel === 'dine_in' && (
              <p className="pos-dining-selection" role="status">
                Mesa seleccionada: {dining.label}
              </p>
            )}
            {terminal && dining && channel === 'dine_in' && (
              <TableOrders key={dining.id} selection={dining} />
            )}
            {terminal && dining && (
              <p className="pos-new-lines-label">Nuevos productos · pendientes de guardar</p>
            )}
            {terminal ? (
              <PosOrderLines
                lines={cart}
                currency={currency}
                selectedKey={activeLine}
                disabled={locked}
                onSelect={setActiveLine}
                onQuantity={quantity}
                onRemove={(key) =>
                  setCart((previous) => previous.filter((line) => line.key !== key))
                }
                onNotes={(key, notes) =>
                  setCart((previous) =>
                    previous.map((line) => (line.key === key ? { ...line, notes } : line)),
                  )
                }
              />
            ) : cart.length ? (
              <div className="cart-lines" role="table" aria-label="Líneas del pedido">
                {terminal && (
                  <div className="pos-lines-heading" role="row">
                    <span role="columnheader">Producto / cantidad</span>
                    <span role="columnheader">Subtotal</span>
                  </div>
                )}
                {cart.map((line) => (
                  <div
                    className="cart-line"
                    role="row"
                    key={line.key}
                    data-selected={terminal && activeLine === line.key}
                    onClick={() => terminal && setActiveLine(line.key)}
                  >
                    <div className="cart-line-title" role="cell">
                      <div>
                        <strong>{line.product_name}</strong>
                        {line.variant_name && <small>{line.variant_name}</small>}
                        <ModifierDetails groups={line.modifier_labels} currency={currency} />
                        <CartComboDetails line={line} currency={currency} />
                        {!(line.kind === 'combo' && line.price_context?.promotion) && (
                          <PriceDetails context={line.price_context} currency={currency} />
                        )}
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Quitar ${line.product_name}`}
                        disabled={locked}
                        onClick={() =>
                          setCart((previous) => previous.filter((item) => item.key !== line.key))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="cart-line-controls" role="cell">
                      <div className="quantity-stepper">
                        <button
                          type="button"
                          aria-label={`Restar ${line.product_name}`}
                          disabled={line.quantity <= 1 || locked}
                          onClick={() => quantity(line.key, line.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Sumar ${line.product_name}`}
                          disabled={line.quantity >= 999 || locked}
                          onClick={() => quantity(line.key, line.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span>{formatMoney(cartSubtotal([line]), currency)}</span>
                    </div>
                    <input
                      aria-label={`Observación para ${line.product_name}`}
                      placeholder="Observación de preparación…"
                      maxLength={300}
                      disabled={locked}
                      value={line.notes}
                      onChange={(event) =>
                        setCart((previous) =>
                          previous.map((item) =>
                            item.key === line.key ? { ...item, notes: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="cart-empty">
                <ShoppingBag size={30} />
                <p>Agrega el primer sabor a este pedido.</p>
              </div>
            )}
            {!terminal && (
              <button
                type="button"
                className="button secondary"
                aria-expanded={details}
                onClick={() => setDetails(!details)}
              >
                Datos del pedido · cliente y notas
              </button>
            )}
            <fieldset
              disabled={locked}
              className="form-stack pos-order-details"
              data-open={details}
            >
              {
                <button
                  type="button"
                  className="pos-detail-close"
                  onClick={() => setDetails(false)}
                >
                  Cerrar detalles
                </button>
              }
              <Field label="Tipo de pedido">
                <select
                  name="channel"
                  value={channel}
                  onChange={(event) =>
                    selected &&
                    pricing.request({
                      branchId: selected,
                      channel: event.target.value as OrderChannel,
                    })
                  }
                >
                  <option value="takeaway">Para llevar</option>
                  <option value="dine_in">En el restaurante</option>
                </select>
              </Field>
              <Field label="Referencia del pedido">
                <input
                  name="reference"
                  maxLength={80}
                  placeholder="Ej. Mesa 4 o nombre de recogida"
                />
              </Field>
              {selected && channel === 'dine_in' && can('dining.view') && can('dining.operate') && (
                <Suspense fallback={<Loading />}>
                  <DiningSessionPicker
                    key={selected}
                    branchId={selected}
                    selected={dining}
                    disabled={locked}
                    onChange={setDining}
                  />
                </Suspense>
              )}
              <Field label="Nombre del cliente">
                <input name="customer_name" maxLength={100} placeholder="Opcional" />
              </Field>
              <Field label="Observación general">
                <textarea
                  name="notes"
                  maxLength={1000}
                  rows={2}
                  placeholder="Indicaciones para este pedido"
                />
              </Field>
            </fieldset>
            <div className="order-subtotal">
              <span>{terminal ? 'SUBTOTAL' : 'Subtotal del pedido'}</span>
              <strong>{formatMoney(cartSubtotal(cart), currency)}</strong>
            </div>
            <p className="muted small">
              Este registro no incluye cobro ni factura. El descuento, impuesto adicional y redondeo
              se calculan al cobrar el pedido.
            </p>
            {conflict && (
              <button
                type="button"
                className="button secondary"
                disabled={locked}
                onClick={() => {
                  if (selected) pricing.request({ branchId: selected, channel })
                }}
              >
                <RefreshCw size={15} />
                Revisar precios conservando el pedido
              </button>
            )}
            <div className={terminal ? 'pos-order-actions' : undefined}>
              {terminal && dining && (
                <button
                  type="button"
                  className="pos-save-order"
                  disabled={
                    operation.isPending ||
                    pricing.locked ||
                    (!operation.uncertain && (!cart.length || tableOrderUnavailable)) ||
                    (operation.uncertain && orderIntent.current !== 'save')
                  }
                  onClick={() => {
                    if (!operation.uncertain) orderIntent.current = 'save'
                    orderForm.current?.requestSubmit()
                  }}
                >
                  {operation.uncertain && orderIntent.current === 'save'
                    ? 'Reintentar guardado'
                    : activeTableOrder.data?.data[0]
                      ? 'ACTUALIZAR PEDIDO'
                      : 'GUARDAR EN MESA'}
                </button>
              )}
              {terminal && (
                <button
                  type="button"
                  className="pos-kitchen"
                  disabled
                  title="El envío a estaciones se habilitará al integrar comandas de cocina"
                >
                  ENVIAR A COCINA · No disponible
                </button>
              )}
              <button
                className="button primary wide"
                aria-label={terminal ? 'Continuar al cobro' : undefined}
                onClick={() => {
                  if (!operation.uncertain) orderIntent.current = 'checkout'
                }}
                ref={submitButton}
                type="submit"
                disabled={
                  operation.isPending ||
                  pricing.locked ||
                  (!operation.uncertain &&
                    (!cart.length || !selected || conflict || !posReady || tableOrderUnavailable))
                }
              >
                <Send size={17} />
                {operation.isPending
                  ? 'Registrando…'
                  : operation.uncertain
                    ? 'Reintentar envío'
                    : terminal
                      ? 'COBRAR'
                      : 'Registrar pedido'}
              </button>
            </div>
          </form>
          {tablesOpen && selected && (
            <PosTablesPanel
              branchId={selected}
              onClose={() => setTablesOpen(false)}
              onSelect={(selection) => {
                setTablesOpen(false)
                if (dining && dining.id !== selection.id && cart.length) {
                  pendingTableSwitch.current = selection
                  orderIntent.current = 'save'
                  orderForm.current?.requestSubmit()
                  return
                }
                if (dining && dining.id !== selection.id) orderForm.current?.reset()
                pendingTableSwitch.current = null
                if (channel === 'dine_in') setDining(selection)
                else {
                  pendingDining.current = selection
                  pricing.request({ branchId: selected, channel: 'dine_in' })
                }
              }}
            />
          )}
        </div>
      </div>
      {picking && selected && (
        <VariantOrderPicker
          product={picking}
          currency={currency}
          branchId={selected}
          channel={channel}
          onPick={(variant) => configure(picking, variant)}
          onClose={() => setPicking(null)}
          onRefresh={() => {
            setPicking(null)
            void products.refetch()
          }}
        />
      )}
      {bundling && selected && (
        <Suspense fallback={<Loading />}>
          <ComboOrderPicker
            product={bundling}
            branchId={selected}
            channel={channel}
            currency={currency}
            onPick={addLine}
            onClose={() => setBundling(null)}
            onRefresh={() => {
              setBundling(null)
              void products.refetch()
            }}
          />
        </Suspense>
      )}
      {customizing && (
        <ModifierOrderPicker
          product={customizing.product}
          variant={customizing.variant}
          currency={currency}
          onPick={(configuration) => add(customizing.product, customizing.variant, configuration)}
          onClose={() => setCustomizing(null)}
          onRefresh={() => {
            void products.refetch()
            setCustomizing(null)
          }}
        />
      )}
      {pricing.review && (
        <Suspense fallback={<Loading />}>
          <PriceReviewModal
            review={pricing.review}
            currency={currency}
            onApply={pricing.accept}
            onCancel={() => {
              pendingDining.current = null
              pricing.cancel()
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
