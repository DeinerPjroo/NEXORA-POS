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
import { loadPosContext, savePosContext } from '../pos/pos-context'
import type { DiningSelection } from '../dining/session-types'

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
  const operation = useOperation<Order>('orders', async (order) => {
    await client.invalidateQueries({ queryKey: ['orders'] })
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
      if (target.channel !== 'dine_in' || target.branchId !== dining?.branch_id) setDining(null)
      operation.reset()
      void client.invalidateQueries({ queryKey: ['products', 'order-menu'] })
    },
  })
  const locked = operation.locked || pricing.locked
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
    if (!selected || !cart.length || pricing.locked || !posReady) return
    const data = Object.fromEntries(new FormData(event.currentTarget))
    operation.send({
      ...data,
      branch_id: selected,
      channel,
      currency,
      items: serializeCart(cart, true),
      ...(dining && dining.branch_id === selected && channel === 'dine_in'
        ? { dining_session_id: dining.id, dining_session_revision: dining.revision }
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
    <div className={terminal ? 'pos-terminal' : undefined} data-pos-panel={panel}>
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
        <section className="pos-status panel" aria-label="Estado del terminal">
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
        <section className="order-menu">
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
        </section>
        <form className="panel order-cart" onSubmit={submit}>
          <div className="panel-heading">
            <h2>
              <ShoppingBag size={19} />
              Tu pedido
            </h2>
            <span className="pill neutral">
              {cart.reduce((total, line) => total + line.quantity, 0)} unidades
            </span>
          </div>
          <ErrorNotice error={operation.error} />
          <ErrorNotice error={pricing.error} />
          {pricing.pending && (
            <p className="notice">Consultando precios actuales sin registrar el pedido…</p>
          )}
          <OperationNotice uncertain={operation.uncertain} />
          {cart.length ? (
            <div className="cart-lines">
              {cart.map((line) => (
                <div className="cart-line" key={line.key}>
                  <div className="cart-line-title">
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
                  <div className="cart-line-controls">
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
          <fieldset disabled={locked} className="form-stack">
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
            <span>Subtotal del pedido</span>
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
          <button
            className="button primary wide"
            ref={submitButton}
            type="submit"
            disabled={
              operation.isPending ||
              pricing.locked ||
              (!operation.uncertain && (!cart.length || !selected || conflict || !posReady))
            }
          >
            <Send size={17} />
            {operation.isPending
              ? 'Registrando…'
              : operation.uncertain
                ? 'Reintentar envío'
                : terminal
                  ? 'Continuar al cobro'
                  : 'Registrar pedido'}
          </button>
        </form>
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
            onCancel={pricing.cancel}
          />
        </Suspense>
      )}
    </div>
  )
}
