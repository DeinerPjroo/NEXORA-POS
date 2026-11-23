import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  StickyNote,
  Trash2,
  UtensilsCrossed,
  UserRound,
  X,
} from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading, PageTitle, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { usePosLayout } from '../studio/usePosLayout'
import { posLayoutStyle, type PosLayout } from '../studio/pos-layout'
import '../studio/pos-layout.css'
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
import { cartSubtotal, contextualPrice, makeLine, serializeCart, withDestination } from './cart'
import type { CartLine, CartConfiguration } from './cart'
import type { OrderChannel } from '../catalog/context-price-types'
import { useCartPricing } from './useCartPricing'
import { PriceDetails } from './PriceDetails'
import { CartComboDetails } from './CartComboDetails'
import type { CashOption, SalesSettings } from '../sales/types'
import { PosCategories, PosKeypad, defaultPosLayout } from '../pos/PosPanels'
import '../pos/terminal.css'
import { loadPosContext, savePosContext } from '../pos/pos-context'
import { unifiedOrderSubtotal } from '../pos/unified-order'
import type { DiningSession } from '../dining/session-types'
import type { DiningSelection } from '../dining/session-types'
import { PosOrderLines } from '../pos/PosOrderLines'
import '../pos/digital-order.css'
import '../pos/digital-menu.css'
import { PosTablesPanel } from '../dining/PosTablesPanel'
import { TerminalCheckout } from '../pos/TerminalCheckout'
import { KitchenSend } from '../kitchen/KitchenSend'
import { TableKitchen, CorrectPreparation } from '../kitchen/TableKitchen'
import { useTerminalGuard, useTerminalOrders } from '../pos/TerminalEnvironment'
import { PosPickupsPanel } from './PosPickupsPanel'
import { PosOrdersPanel } from './PosOrdersPanel'
import { OrderCustomerEditor } from './OrderCustomerEditor'
import { DeliveryCustomerFields } from './DeliveryCustomerFields'
import { DeliveryFeeFields } from './DeliveryFeeFields'
import { OrderPrintActions, orderDraft } from './OrderPrintActions'

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
  initialChannel,
  initialOrder,
  onReturn,
  studioPreview,
}: {
  terminal?: boolean
  initialDining?: DiningSelection
  initialChannel?: OrderChannel
  initialOrder?: Order
  onReturn?: () => void
  studioPreview?: PosLayout
}) {
  const appendDelivery = initialOrder?.channel === 'delivery'
  const [appendSnapshot, setAppendSnapshot] = useState(initialOrder)
  const context = useOperationContext(terminal)
  const { session } = useSession()
  const [currency] = useState(session!.company.currency)
  const [remembered] = useState(() =>
    terminal ? loadPosContext(session!) : { branchId: null, channel: 'takeaway' as OrderChannel },
  )
  const [branch, setBranch] = useState<number | null>(
    initialOrder?.branch_id ?? initialDining?.branch_id ?? remembered.branchId,
  )
  const [channel, setChannel] = useState<OrderChannel>(
    initialOrder?.channel ??
      (initialDining ? 'dine_in' : (initialChannel ?? (terminal ? 'dine_in' : remembered.channel))),
  )
  const [dining, setDining] = useState<DiningSelection | null>(initialDining ?? null)
  const [details, setDetails] = useState<false | 'client' | 'notes'>(false)
  const [tablesOpen, setTablesOpen] = useState(false)
  const [pickupsOpen, setPickupsOpen] = useState(false)
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [ordersCheckoutId, setOrdersCheckoutId] = useState<number | null>(null)
  const [customerEditId, setCustomerEditId] = useState<number | null>(null)
  const [customerEditBusy, setCustomerEditBusy] = useState(false)
  const [deliveryBookBusy, setDeliveryBookBusy] = useState(false)
  const [deliveryDirty, setDeliveryDirty] = useState(false)
  const [deliveryFormEpoch, setDeliveryFormEpoch] = useState(0)
  const [deliveryFeeReady, setDeliveryFeeReady] = useState(false)
  const [deliveryFeeDirty, setDeliveryFeeDirty] = useState(false)
  const [pickupId, setPickupId] = useState<number | null>(initialOrder?.id ?? null)
  const pendingDining = useRef<DiningSelection | null>(null)
  const pendingTableSwitch = useRef<DiningSelection | null>(null)
  const orderIntent = useRef<'save' | 'checkout' | 'kitchen'>(
    terminal && !session!.permissions.includes('sales.collect') ? 'save' : 'checkout',
  )
  const [kitchenOrderId, setKitchenOrderId] = useState<number | null>(null)
  const [tableKitchen, setTableKitchen] = useState(false)
  const [correction, setCorrection] = useState<{
    orderId: number
    revision: number
    itemIds: number[]
  } | null>(null)
  const orderForm = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (terminal && details)
      orderForm.current
        ?.querySelector<HTMLElement>(
          details === 'notes' ? '[name="notes"]' : '[name="customer_name"]',
        )
        ?.focus()
  }, [terminal, details])
  const [statusOpen, setStatusOpen] = useState(false)
  const [photos, setPhotos] = useState<boolean | null>(null)
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
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null)
  const [checkoutOrderId, setCheckoutOrderId] = useState<number | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutContext, setCheckoutContext] = useState('')
  const currentCheckoutContext = `${branch}:${channel}:${dining?.id ?? ''}`
  const resumableCheckoutId = checkoutContext === currentCheckoutContext ? checkoutOrderId : null
  useEffect(() => {
    if (!terminal || studioPreview) return
    document.body.classList.add('pos-active')
    return () => document.body.classList.remove('pos-active')
  }, [terminal, studioPreview])
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
    !can('sales.collect') ||
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
  const pickupOrder = useQuery({
    queryKey: ['orders', 'pos-pickup', pickupId],
    queryFn: ({ signal }) => api<{ data: Order }>(`orders/${pickupId}`, { signal }),
    enabled: !!pickupId && channel !== 'dine_in' && !appendDelivery,
    refetchInterval: appendDelivery ? false : 15000,
  })
  const savedPickup = channel !== 'dine_in' && !!pickupId
  const acknowledged =
    terminal && dining && confirmedOrder?.dining_session_id === dining.id ? confirmedOrder : null
  const currentOrder = appendDelivery
    ? appendSnapshot
    : terminal && dining && channel === 'dine_in'
      ? (acknowledged ?? activeTableOrder.data?.data[0])
      : savedPickup &&
          pickupOrder.data?.data.channel === channel &&
          pickupOrder.data.data.branch_id === selected
        ? pickupOrder.data.data
        : undefined
  const appendUnavailable =
    !!appendDelivery &&
    (!currentOrder ||
      !!currentOrder.sale_id ||
      currentOrder.status === 'cancelled' ||
      !currentOrder.delivery_revision ||
      !['pending', 'assigned'].includes(currentOrder.delivery_status ?? ''))
  const savedReadOnly = (savedPickup && !appendDelivery) || appendUnavailable
  async function refreshAppend() {
    const fresh = await pickupOrder.refetch()
    if (!fresh.isError && fresh.data) {
      setAppendSnapshot(fresh.data.data)
      operation.reset()
    }
  }
  const displayCart = acknowledged ? [] : cart
  const operation = useOperation<Order>('orders', async (order) => {
    if (appendDelivery) {
      setAppendSnapshot(order)
      setCart([])
      setActiveLine(null)
      client.setQueryData(['orders', 'pos-pickup', order.id], { data: order })
      client.setQueryData(['order', order.id], { data: order })
      void client.invalidateQueries({ queryKey: ['deliveries'] })
      setCheckoutOrderId(order.id)
      setCheckoutContext(currentCheckoutContext)
      if (orderIntent.current === 'kitchen') setKitchenOrderId(order.id)
      else if (orderIntent.current === 'checkout') setCheckoutOpen(true)
      else toast('Domicilio actualizado. Solo se agregaron los nuevos productos.')
      return
    }
    if (order.channel === 'delivery') {
      setDeliveryDirty(false)
      setDeliveryFeeDirty(false)
      setDeliveryFormEpoch((value) => value + 1)
      orderForm.current?.reset()
    }
    if (terminal && order.dining_session_id) setConfirmedOrder(order)
    await client.invalidateQueries({ queryKey: ['orders'] })
    if (order.dining_session_id) await client.invalidateQueries({ queryKey: ['dining-occupancy'] })
    if (order.dining_session_id)
      await client.invalidateQueries({ queryKey: ['table-active-order', order.dining_session_id] })
    if (orderIntent.current !== 'checkout' && order.dining_session_id) {
      const fresh = await api<{ data: DiningSession }>('dining-sessions/' + order.dining_session_id)
      await client.invalidateQueries({ queryKey: ['table-orders', order.dining_session_id] })
      setCart([])
      setActiveLine(null)
      setConfirmedOrder(null)
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
      if (orderIntent.current === 'kitchen') setKitchenOrderId(order.id)
      toast('Pedido guardado en su mesa.')
      return
    }
    if (terminal && (orderIntent.current !== 'checkout' || !can('sales.collect'))) {
      setCart([])
      if (order.channel !== 'dine_in') {
        client.setQueryData(['orders', 'pos-pickup', order.id], { data: order })
        setPickupId(order.id)
      }
      setActiveLine(null)
      setConfirmedOrder(null)
      setCheckoutOrderId(order.id)
      setCheckoutContext(currentCheckoutContext)
      if (orderIntent.current === 'kitchen') setKitchenOrderId(order.id)
      else toast('Pedido guardado. Puedes enviarlo a cocina.')
      return
    }
    toast(
      terminal
        ? 'Pedido registrado. Revisa y confirma el cobro.'
        : 'Pedido registrado. No se ha realizado ningún cobro.',
    )
    if (terminal) {
      setCart([])
      if (order.channel !== 'dine_in') {
        client.setQueryData(['orders', 'pos-pickup', order.id], { data: order })
        setPickupId(order.id)
      }
      setActiveLine(null)
      setConfirmedOrder(null)
      setCheckoutOrderId(order.id)
      setCheckoutContext(currentCheckoutContext)
      setCheckoutOpen(true)
    } else if (can('orders.view')) navigate(`/pedidos/${order.id}`)
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
  const locked = operation.locked || pricing.locked || !!customerEditId || deliveryBookBusy
  const studio = usePosLayout(
    terminal && channel === 'dine_in',
    locked ||
      checkoutOpen ||
      cart.length > 0 ||
      deliveryDirty ||
      deliveryFeeDirty ||
      !!kitchenOrderId,
    studioPreview,
  )
  const customerAvailable =
    !appendDelivery &&
    !!selected &&
    !tableOrderUnavailable &&
    !ordersOpen &&
    !tablesOpen &&
    !pickupsOpen &&
    (currentOrder
      ? !currentOrder.sale_id && !['cancelled', 'delivered'].includes(currentOrder.status)
      : !savedPickup && (channel !== 'dine_in' || !!dining))
  const notesAvailable =
    !!selected &&
    !savedPickup &&
    !currentOrder?.sale_id &&
    !ordersOpen &&
    !tablesOpen &&
    !pickupsOpen &&
    (channel === 'takeaway' || (channel === 'dine_in' && !!dining))
  const openOrdersPanel = useCallback(() => {
    if (locked || cart.length || appendDelivery) return
    setOrdersOpen(true)
    setPickupsOpen(false)
    setTablesOpen(false)
    setDetails(false)
    setPanel('cart')
  }, [locked, cart.length, appendDelivery])
  useTerminalOrders(terminal && !studioPreview ? openOrdersPanel : null)
  useTerminalGuard(
    terminal &&
      (cart.length > 0 ||
        locked ||
        checkoutOpen ||
        (channel === 'delivery' && (deliveryDirty || deliveryFeeDirty))),
    terminal &&
      (operation.locked || pricing.locked || checkoutOpen || customerEditBusy || deliveryBookBusy),
  )
  useEffect(() => {
    if (pricing.error) pendingDining.current = null
  }, [pricing.error])
  useEffect(() => {
    if (terminal && !studioPreview && selected && !locked)
      savePosContext(session!, selected, channel)
  }, [terminal, studioPreview, selected, channel, locked, session])
  useEffect(() => {
    if (!terminal || studioPreview || checkoutOpen || customerEditId || deliveryBookBusy) return
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
  }, [
    terminal,
    studioPreview,
    checkoutOpen,
    customerEditId,
    deliveryBookBusy,
    picking,
    bundling,
    customizing,
    pricing.review,
  ])
  function configure(product: Product, variant?: Variant) {
    if (savedReadOnly || (terminal && channel === 'dine_in' && !dining)) return
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
    if (locked || savedReadOnly || (terminal && channel === 'dine_in' && !dining)) return
    line = withDestination(line, channel === 'dine_in' ? 'table' : 'takeaway')
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
  function destination(key: string, target: 'table' | 'takeaway', split?: number) {
    if (locked) return
    const source = cart.find((l) => l.key === key)
    if (
      !source ||
      (split !== undefined && (!Number.isInteger(split) || split < 1 || split >= source.quantity))
    )
      return
    let movedKey = withDestination(source, target).key
    if (
      cart.some(
        (l) =>
          l.key === movedKey &&
          (l.notes !== source.notes || l.expected_unit_price !== source.expected_unit_price),
      )
    )
      movedKey = withDestination(
        {
          ...source,
          key:
            source.key.replace(/\|destination=(table|takeaway)$/, '') +
            '|move=' +
            crypto.randomUUID(),
        },
        target,
      ).key
    setActiveLine(movedKey)
    setCart((previous) => {
      const selected = previous.find((l) => l.key === key)
      if (
        !selected ||
        (split !== undefined &&
          (!Number.isInteger(split) || split < 1 || split >= selected.quantity))
      )
        return previous
      const moved = {
        ...withDestination({ ...selected, quantity: split ?? selected.quantity }, target),
        key: movedKey,
      }
      const rest = previous.flatMap((l) =>
        l.key !== key ? [l] : split ? [{ ...l, quantity: l.quantity - split }] : [],
      )
      const existing = rest.find(
        (l) =>
          l.key === moved.key &&
          l.notes === moved.notes &&
          l.expected_unit_price === moved.expected_unit_price,
      )
      return existing
        ? rest.map((l) => (l === existing ? { ...l, quantity: l.quantity + moved.quantity } : l))
        : [...rest, moved]
    })
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (
      !selected ||
      savedReadOnly ||
      !cart.length ||
      pricing.locked ||
      tableOrderUnavailable ||
      (channel === 'delivery' && !appendDelivery && !deliveryFeeReady) ||
      (orderIntent.current === 'checkout' && terminal && (!posReady || !can('sales.collect')))
    )
      return
    if (channel === 'dine_in' && !dining) {
      setTablesOpen(true)
      toast('Selecciona la mesa para este pedido.')
      return
    }
    const {
      delivery_name,
      delivery_phone,
      delivery_address,
      delivery_instructions,
      delivery_neighborhood,
      delivery_location_reference,
      delivery_customer_id,
      delivery_customer_revision,
      delivery_customer_address_id,
      delivery_address_revision,
      delivery_zone_id,
      delivery_fee_policy_revision,
      delivery_fee_profile_revision,
      delivery_fee_zone_revision,
      delivery_expected_fee_total,
      delivery_fee_override,
      delivery_fee_override_reason,
      ...data
    } = Object.fromEntries(new FormData(event.currentTarget))
    if (
      channel === 'delivery' &&
      !appendDelivery &&
      (!String(delivery_name ?? '').trim() ||
        String(delivery_phone ?? '').trim().length < 3 ||
        String(delivery_address ?? '').trim().length < 5)
    ) {
      setDetails('client')
      toast('Completa nombre, teléfono y dirección del domicilio.')
      return
    }
    operation.send({
      ...(appendDelivery
        ? {
            append_order_id: currentOrder!.id,
            order_revision: currentOrder!.revision,
            delivery_revision: currentOrder!.delivery_revision,
          }
        : data),
      branch_id: selected,
      channel,
      currency,
      items: serializeCart(cart, true),
      ...(channel === 'delivery' && !appendDelivery
        ? {
            delivery: {
              recipient_name: delivery_name,
              phone: delivery_phone,
              address: delivery_address,
              instructions: delivery_instructions || null,
              neighborhood: delivery_neighborhood || null,
              location_reference: delivery_location_reference || null,
              ...(delivery_fee_policy_revision !== undefined && delivery_fee_policy_revision !== ''
                ? { fee_policy_revision: Number(delivery_fee_policy_revision) }
                : {}),
              ...(delivery_fee_profile_revision
                ? { fee_profile_revision: Number(delivery_fee_profile_revision) }
                : {}),
              ...(delivery_zone_id
                ? {
                    delivery_zone_id: Number(delivery_zone_id),
                    fee_zone_revision: Number(delivery_fee_zone_revision),
                  }
                : {}),
              ...(delivery_expected_fee_total
                ? { expected_fee_total: delivery_expected_fee_total }
                : {}),
              ...(delivery_fee_override !== undefined
                ? {
                    fee_override: delivery_fee_override,
                    fee_override_reason: delivery_fee_override_reason,
                  }
                : {}),
              ...(delivery_customer_id
                ? {
                    customer_id: Number(delivery_customer_id),
                    customer_revision: Number(delivery_customer_revision),
                  }
                : {}),
              ...(delivery_customer_address_id
                ? {
                    customer_address_id: Number(delivery_customer_address_id),
                    address_revision: Number(delivery_address_revision),
                  }
                : {}),
            },
          }
        : {}),
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
      data-mode={checkoutOpen ? 'checkout' : 'order'}
      data-photos={photos ?? (studio.revision !== 0 && studio.configuration.options.photos)}
      data-studio={studio.revision !== 0}
      data-studio-hints={studio.configuration.options.hints}
      data-studio-revision={studio.revision}
      style={studio.revision !== 0 ? posLayoutStyle(studio.configuration) : undefined}
      data-layout-version={defaultPosLayout.schemaVersion}
      ref={terminalRoot}
    >
      {terminal && (
        <header className="pos-topbar" data-pos-slot="header" inert={checkoutOpen}>
          <span className="pos-ready">
            {!can('sales.collect')
              ? '● Toma de pedidos'
              : posReady
                ? '● Caja abierta'
                : '● Revisar caja/configuración'}
          </span>
          <OperationalBranchPicker
            branches={activeBranches}
            value={selected}
            onChange={(branchId) => pricing.request({ branchId, channel })}
            disabled={locked || savedPickup || pickupsOpen || ordersOpen}
          />
          {can('sales.collect') && (
            <button
              type="button"
              onClick={() => setStatusOpen(!statusOpen)}
              aria-expanded={statusOpen}
            >
              Caja
            </button>
          )}
          <button
            type="button"
            aria-label="Actualizar estado del terminal"
            disabled={operation.isPending || pricing.locked}
            onClick={() => {
              void context.refetch()
              if (can('sales.collect')) {
                if (selected) void posCash.refetch()
                void posSettings.refetch()
              }
            }}
          >
            ↻
          </button>
          <button
            type="button"
            aria-label="Mostrar fotografías"
            aria-pressed={photos ?? (studio.revision !== 0 && studio.configuration.options.photos)}
            onClick={() =>
              setPhotos(!(photos ?? (studio.revision !== 0 && studio.configuration.options.photos)))
            }
          >
            Fotos
          </button>
          <strong className="pos-channel-label">
            {channel === 'dine_in'
              ? dining?.label || 'Mesas · selecciona una mesa'
              : channel === 'delivery'
                ? 'Domicilios · entrega'
                : 'Para llevar · Mostrador'}
          </strong>
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
      {terminal && can('sales.collect') && (
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
      <div className="order-composer" inert={checkoutOpen}>
        {terminal && (
          <>
            <aside className="pos-actions" data-pos-slot="actions">
              {channel === 'takeaway' && (
                <>
                  <button
                    type="button"
                    disabled={locked || !!cart.length || !selected}
                    aria-expanded={pickupsOpen}
                    onClick={() => {
                      setTablesOpen(false)
                      setOrdersOpen(false)
                      setPickupsOpen(!pickupsOpen)
                      setPanel('cart')
                    }}
                  >
                    Recogidas
                  </button>
                  <button
                    type="button"
                    disabled={locked || !!cart.length}
                    onClick={() => {
                      setPickupId(null)
                      setCheckoutOrderId(null)
                      setCheckoutContext('')
                      setPickupsOpen(false)
                      setOrdersOpen(false)
                      setDetails(false)
                      orderForm.current?.reset()
                      operation.reset()
                    }}
                  >
                    Nueva recogida
                  </button>
                </>
              )}
              {channel === 'delivery' && (
                <button
                  type="button"
                  disabled={
                    locked ||
                    (!appendDelivery && (!!cart.length || deliveryDirty || deliveryFeeDirty))
                  }
                  onClick={() => {
                    if (appendDelivery) {
                      if (
                        !cart.length ||
                        window.confirm('¿Volver sin guardar los productos agregados?')
                      )
                        onReturn?.()
                      return
                    }
                    setPickupId(null)
                    setCheckoutOrderId(null)
                    setCheckoutContext('')
                    setOrdersOpen(false)
                    setDetails(false)
                    setDeliveryFormEpoch((value) => value + 1)
                    setDeliveryDirty(false)
                    setDeliveryFeeDirty(false)
                    orderForm.current?.reset()
                    operation.reset()
                  }}
                >
                  {appendDelivery ? 'Volver a domicilios' : 'Nuevo domicilio'}
                </button>
              )}
              {channel === 'dine_in' && (
                <button
                  type="button"
                  disabled={
                    locked ||
                    savedPickup ||
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
                    setOrdersOpen(false)
                    setPickupsOpen(false)
                    setPanel('cart')
                  }}
                >
                  Mesas
                </button>
              )}
              <button
                type="button"
                disabled={locked || !customerAvailable}
                onClick={() => {
                  setTablesOpen(false)
                  setOrdersOpen(false)
                  setPickupsOpen(false)
                  if (currentOrder) {
                    setCustomerEditId(currentOrder.id)
                    return
                  }
                  setDetails('client')
                  setPanel('cart')
                }}
              >
                Cliente
              </button>
              <button
                type="button"
                disabled={locked || !!cart.length || !selected || appendDelivery}
                aria-expanded={ordersOpen}
                onClick={() => {
                  setOrdersOpen(!ordersOpen)
                  setPickupsOpen(false)
                  setTablesOpen(false)
                  setDetails(false)
                  setPanel('cart')
                }}
              >
                Pedidos
              </button>
              <button
                type="button"
                disabled={locked || !notesAvailable}
                title="Notas para una mesa seleccionada o una nueva recogida"
                aria-expanded={details === 'notes'}
                onClick={() => {
                  setTablesOpen(false)
                  setOrdersOpen(false)
                  setPickupsOpen(false)
                  setDetails('notes')
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
              <OrderPrintActions
                order={currentOrder}
                disabled={
                  locked || tableOrderUnavailable || ordersOpen || pickupsOpen || tablesOpen
                }
                getDraft={
                  currentOrder?.items?.length || displayCart.length
                    ? () => {
                        const fields = orderForm.current ? new FormData(orderForm.current) : null
                        const saved = currentOrder ? orderDraft(currentOrder) : null
                        return {
                          ...saved,
                          channel,
                          currency,
                          orderId: currentOrder?.id,
                          branch: context.data?.branches.find((b) => b.id === selected)?.name,
                          table: dining?.label ?? saved?.table,
                          customer:
                            saved?.customer ??
                            String(
                              fields?.get('customer_name') || fields?.get('delivery_name') || '',
                            ),
                          reference: saved?.reference ?? String(fields?.get('reference') || ''),
                          notes: saved?.notes ?? String(fields?.get('notes') || ''),
                          subtotal: unifiedOrderSubtotal(currentOrder?.subtotal, displayCart),
                          pending: !!displayCart.length,
                          lines: [
                            ...(saved?.lines ?? []),
                            ...displayCart.map((line) => ({
                              name: [line.product_name, line.variant_name]
                                .filter(Boolean)
                                .join(' · '),
                              quantity: line.quantity,
                              amount: cartSubtotal([line]),
                              notes: line.notes,
                              destination:
                                line.preparation_destination ??
                                (channel === 'dine_in' ? 'table' : 'takeaway'),
                              preparations: [
                                ...(line.modifier_labels?.flatMap((g) =>
                                  g.options.map((o) => o.name),
                                ) ?? []),
                                ...(line.components?.map((part) =>
                                  [part.product_name, part.variant_name, part.notes]
                                    .filter(Boolean)
                                    .join(' · '),
                                ) ?? []),
                              ],
                            })),
                          ],
                        }
                      }
                    : undefined
                }
              />
              <button
                type="button"
                className="pos-cancel"
                disabled={
                  locked ||
                  (!cart.length && !(channel === 'delivery' && (deliveryDirty || deliveryFeeDirty)))
                }
                onClick={() => {
                  if (window.confirm('¿Descartar este pedido sin registrar?')) {
                    setCart([])
                    setActiveLine(null)
                    if (channel === 'delivery') {
                      setDeliveryFormEpoch((value) => value + 1)
                      setDeliveryDirty(false)
                      setDeliveryFeeDirty(false)
                      orderForm.current?.reset()
                    }
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
                      style={
                        terminal
                          ? ({ '--product-accent': product.category.color } as CSSProperties)
                          : undefined
                      }
                      disabled={
                        !product.sellable ||
                        locked ||
                        savedReadOnly ||
                        pickupsOpen ||
                        ordersOpen ||
                        products.isFetching ||
                        (!posReady && channel !== 'delivery') ||
                        (channel === 'dine_in' && !dining) ||
                        !!currentOrder?.sale_id
                      }
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
                          <img src={product.image_url} alt="" loading="lazy" />
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
          data-view={
            terminal && (tablesOpen || pickupsOpen || ordersOpen || customerEditId)
              ? 'tables'
              : 'order'
          }
        >
          <form
            className="panel order-cart"
            onSubmit={submit}
            ref={orderForm}
            data-pos-slot="order"
            inert={terminal && (tablesOpen || pickupsOpen || ordersOpen || !!customerEditId)}
            aria-hidden={
              terminal && (tablesOpen || pickupsOpen || ordersOpen || !!customerEditId)
                ? true
                : undefined
            }
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
                {displayCart.reduce((total, line) => total + line.quantity, 0) +
                  (currentOrder?.items?.reduce((total, line) => total + line.quantity, 0) ??
                    0)}{' '}
                unidades
              </span>
            </div>
            <ErrorNotice error={operation.error} />
            {savedPickup && (
              <>
                <ErrorNotice error={pickupOrder.error} />
                {!appendDelivery && pickupOrder.isPending && <p role="status">Cargando pedido…</p>}
                {pickupOrder.error && (
                  <button type="button" onClick={() => void pickupOrder.refetch()}>
                    Reintentar consulta
                  </button>
                )}
                {currentOrder && (
                  <div className="pos-dining-selection">
                    <strong>
                      {currentOrder.customer_name ||
                        (channel === 'delivery' ? 'Domicilio' : 'Recogida en mostrador')}
                    </strong>
                    {' · '}
                    {currentOrder.sale_status === 'paid' ? 'Pagada' : 'Pedido registrado'}
                    {currentOrder.reference && (
                      <div className="small">Referencia: {currentOrder.reference}</div>
                    )}
                  </div>
                )}
                <p className="muted small">
                  {appendDelivery
                    ? 'Añade productos al mismo pedido. La tarifa de envío registrada se conserva.'
                    : channel === 'delivery'
                      ? 'Pedido de domicilio guardado. Puedes consultar sus productos, enviarlo a cocina o cobrarlo cuando corresponda.'
                      : 'Consulta, envía a cocina o cobra esta recogida. Para otro cliente, pulsa Nueva recogida.'}
                </p>
              </>
            )}
            {appendDelivery && conflict && !locked && (
              <button
                type="button"
                disabled={pickupOrder.isFetching}
                onClick={() => void refreshAppend()}
              >
                Actualizar pedido conservando adiciones
              </button>
            )}
            {appendUnavailable && (
              <p className="notice">
                Este domicilio ya tiene venta registrada o salió a reparto. No admite adiciones.
              </p>
            )}
            <ErrorNotice error={pricing.error} />
            {pricing.pending && (
              <p className="notice">Consultando precios actuales sin registrar el pedido…</p>
            )}
            <OperationNotice uncertain={operation.uncertain} />
            {terminal && channel === 'dine_in' && !dining && (
              <p className="pos-dining-selection" role="status">
                Selecciona una mesa para comenzar su pedido.
              </p>
            )}
            {dining && channel === 'dine_in' && (
              <p className="pos-dining-selection" role="status">
                Mesa seleccionada: {dining.label}
              </p>
            )}
            {currentOrder && (
              <div className="pos-current-order-reference">Pedido #{currentOrder.id}</div>
            )}
            {dining && (
              <button
                type="button"
                className="text-button"
                disabled={locked}
                onClick={() => setTableKitchen(true)}
              >
                Comandas de esta mesa
              </button>
            )}
            {terminal && dining && activeTableOrder.isPending && (
              <p className="notice">Cargando pedido de la mesa…</p>
            )}
            {terminal && dining && <ErrorNotice error={activeTableOrder.error} />}
            {terminal ? (
              <PosOrderLines
                lines={displayCart}
                recordedItems={currentOrder?.items}
                currency={currency}
                selectedKey={activeLine}
                disabled={locked}
                destinations={channel === 'dine_in' && !!dining}
                onDestination={destination}
                onSplit={(key, amount) => {
                  const line = cart.find((l) => l.key === key)
                  if (line)
                    destination(
                      key,
                      line.preparation_destination === 'table' ? 'takeaway' : 'table',
                      amount,
                    )
                }}
                onCorrect={
                  currentOrder && !['cancelled', 'delivered'].includes(currentOrder.status)
                    ? (ids) =>
                        setCorrection({
                          orderId: currentOrder.id,
                          revision: currentOrder.revision,
                          itemIds: ids,
                        })
                    : undefined
                }
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
                aria-expanded={!!details}
                onClick={() => setDetails(details ? false : 'client')}
              >
                Datos del pedido · cliente y notas
              </button>
            )}
            <fieldset
              disabled={locked || savedPickup}
              className="form-stack pos-order-details"
              data-open={!!details}
              aria-label={details === 'notes' ? 'Notas del pedido' : 'Datos del cliente y pedido'}
            >
              {terminal && (
                <header className="pos-client-heading">
                  <span className="pos-client-icon">
                    {details === 'notes' ? <StickyNote size={22} /> : <UserRound size={22} />}
                  </span>
                  <div>
                    <span className="pos-digital-eyebrow">
                      {details === 'notes' ? 'INDICACIONES DEL PEDIDO' : 'ATENCIÓN PERSONALIZADA'}
                    </span>
                    <h3>{details === 'notes' ? 'Notas del pedido' : 'Cliente y pedido'}</h3>
                  </div>
                  <button
                    type="button"
                    className="pos-detail-close"
                    aria-label="Cerrar detalles"
                    onClick={() => setDetails(false)}
                  >
                    <X size={19} />
                  </button>
                </header>
              )}
              <div className="pos-client-fields">
                {terminal && (
                  <div className="pos-client-context">
                    <span className="pos-client-dot" />
                    {channel === 'takeaway'
                      ? 'Recogida en mostrador'
                      : channel === 'delivery'
                        ? 'Domicilio'
                        : dining?.label || 'Consumo en mesa'}
                  </div>
                )}
                <div
                  className="pos-client-customer-fields"
                  hidden={terminal && details === 'notes'}
                >
                  <Field label="Nombre del cliente">
                    <input
                      name="customer_name"
                      maxLength={100}
                      placeholder="¿A nombre de quién es el pedido?"
                      autoComplete="off"
                    />
                  </Field>
                  {!terminal && (
                    <Field label="Tipo de pedido">
                      <select
                        name="channel"
                        disabled={!!initialChannel}
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
                        <option value="dine_in">Consumo en mesa</option>
                        <option value="delivery">Domicilio</option>
                      </select>
                    </Field>
                  )}
                  {channel === 'delivery' && (
                    <DeliveryCustomerFields
                      key={`${selected}:${deliveryFormEpoch}`}
                      branchId={selected}
                      onBusy={setDeliveryBookBusy}
                      onDirty={setDeliveryDirty}
                    />
                  )}
                  <Field label="Referencia del pedido">
                    <input
                      name="reference"
                      maxLength={80}
                      placeholder="Ej. Mesa 4 o nombre de recogida"
                    />
                  </Field>
                  {!terminal &&
                    selected &&
                    channel === 'dine_in' &&
                    can('dining.view') &&
                    can('dining.operate') && (
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
                </div>
                <div hidden={terminal && details !== 'notes'}>
                  <Field label="Observación general">
                    {terminal && currentOrder ? (
                      <textarea
                        key={`recorded-${currentOrder.id}`}
                        readOnly
                        value={currentOrder.notes ?? ''}
                        rows={5}
                        aria-label="Observación general"
                      />
                    ) : (
                      <textarea
                        key="draft-notes"
                        name="notes"
                        maxLength={1000}
                        rows={terminal ? 5 : 2}
                        placeholder="Indicaciones para este pedido"
                      />
                    )}
                  </Field>
                </div>
              </div>
              {terminal && (
                <footer className="pos-client-footer">
                  <small>
                    {details === 'notes' && currentOrder
                      ? 'Nota del pedido registrado · solo lectura.'
                      : 'Estos datos se guardan al registrar el pedido.'}
                  </small>
                  <button type="button" onClick={() => setDetails(false)}>
                    <Check size={18} />
                    Listo · volver al pedido
                  </button>
                </footer>
              )}
            </fieldset>
            {terminal && channel === 'delivery' && !savedPickup && (
              <DeliveryFeeFields
                key={`fee-${selected}:${deliveryFormEpoch}`}
                branchId={selected}
                currency={currency}
                lines={cart}
                onReady={setDeliveryFeeReady}
                onDirty={setDeliveryFeeDirty}
                onReviewPrices={() => {
                  if (selected && !locked) pricing.request({ branchId: selected, channel })
                }}
              />
            )}
            {channel === 'delivery' && savedPickup && currentOrder?.delivery_charge && (
              <div className="pos-fee-totals">
                <span>Domicilio con sus impuestos</span>
                <strong>{formatMoney(currentOrder.delivery_fee_total ?? '0', currency)}</strong>
              </div>
            )}
            <div className="order-subtotal">
              <span>{terminal ? 'SUBTOTAL' : 'Subtotal del pedido'}</span>
              <strong>
                {formatMoney(
                  terminal
                    ? unifiedOrderSubtotal(currentOrder?.subtotal, displayCart)
                    : cartSubtotal(cart),
                  currency,
                )}
              </strong>
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
              {terminal && channel !== 'dine_in' && (!savedPickup || appendDelivery) && (
                <button
                  type="button"
                  className="pos-save-order"
                  disabled={
                    operation.isPending ||
                    pricing.locked ||
                    (!operation.uncertain && !cart.length) ||
                    (operation.uncertain && orderIntent.current !== 'save') ||
                    (!operation.uncertain &&
                      (appendUnavailable ||
                        conflict ||
                        (channel === 'delivery' && !appendDelivery && !deliveryFeeReady)))
                  }
                  onClick={() => {
                    if (!operation.uncertain) orderIntent.current = 'save'
                    orderForm.current?.requestSubmit()
                  }}
                >
                  {operation.uncertain
                    ? 'Reintentar guardado'
                    : appendDelivery
                      ? 'ACTUALIZAR DOMICILIO'
                      : channel === 'delivery'
                        ? 'GUARDAR DOMICILIO'
                        : 'GUARDAR RECOGIDA'}
                </button>
              )}
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
                  disabled={
                    locked ||
                    tableOrderUnavailable ||
                    (appendDelivery && !!cart.length && (appendUnavailable || conflict)) ||
                    (!operation.uncertain &&
                      channel === 'delivery' &&
                      !savedPickup &&
                      !deliveryFeeReady) ||
                    (savedPickup && (!currentOrder || currentOrder.status === 'cancelled')) ||
                    (!cart.length && !currentOrder && !resumableCheckoutId)
                  }
                  onClick={() => {
                    if (cart.length) {
                      orderIntent.current = 'kitchen'
                      orderForm.current?.requestSubmit()
                    } else setKitchenOrderId(currentOrder?.id ?? resumableCheckoutId)
                  }}
                >
                  ENVIAR A COCINA
                </button>
              )}
              {(!terminal || can('sales.collect')) && (
                <button
                  className="button primary wide"
                  aria-label={terminal ? 'Continuar al cobro' : undefined}
                  onClick={(event) => {
                    if (!operation.uncertain) orderIntent.current = 'checkout'
                    if (
                      !operation.uncertain &&
                      !cart.length &&
                      (currentOrder || resumableCheckoutId)
                    ) {
                      event.preventDefault()
                      setCheckoutOrderId(currentOrder?.id ?? resumableCheckoutId)
                      setCheckoutContext(currentCheckoutContext)
                      setCheckoutOpen(true)
                    }
                  }}
                  ref={submitButton}
                  type="submit"
                  disabled={
                    operation.isPending ||
                    pricing.locked ||
                    (!operation.uncertain &&
                      ((!cart.length && !currentOrder && !resumableCheckoutId) ||
                        !selected ||
                        conflict ||
                        (appendUnavailable && !!cart.length) ||
                        !posReady ||
                        (channel === 'delivery' && !savedPickup && !deliveryFeeReady) ||
                        tableOrderUnavailable)) ||
                    (savedPickup &&
                      (!currentOrder ||
                        currentOrder.status === 'cancelled' ||
                        currentOrder.sale_status === 'paid' ||
                        currentOrder.sale_status === 'refunded'))
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
              )}
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
          {pickupsOpen && selected && (
            <PosPickupsPanel
              key={selected}
              branchId={selected}
              onClose={() => setPickupsOpen(false)}
              onSelect={(id) => {
                setPickupId(id)
                setCheckoutOrderId(null)
                setCheckoutContext('')
                setPickupsOpen(false)
                setDetails(false)
                operation.reset()
              }}
            />
          )}
          {ordersOpen && selected && (
            <PosOrdersPanel
              key={`${selected}:${channel}`}
              branchId={selected}
              initialChannel={channel}
              onClose={() => setOrdersOpen(false)}
              onKitchen={setKitchenOrderId}
              onEditCustomer={setCustomerEditId}
              inactive={!!customerEditId}
              onCheckout={(id) => {
                setOrdersCheckoutId(id)
                setCheckoutOpen(true)
              }}
            />
          )}
          {customerEditId && (
            <OrderCustomerEditor
              key={customerEditId}
              orderId={customerEditId}
              onClose={() => setCustomerEditId(null)}
              onBusy={setCustomerEditBusy}
            />
          )}
        </div>
      </div>
      {kitchenOrderId && (
        <KitchenSend
          orderId={kitchenOrderId}
          onClose={() => {
            setKitchenOrderId(null)
            if (appendDelivery) void refreshAppend()
          }}
        />
      )}
      {tableKitchen && dining && (
        <TableKitchen sessionId={dining.id} onClose={() => setTableKitchen(false)} />
      )}
      {correction && <CorrectPreparation {...correction} onClose={() => setCorrection(null)} />}
      {checkoutOpen && (ordersCheckoutId || checkoutOrderId) && (
        <TerminalCheckout
          key={ordersCheckoutId ?? checkoutOrderId!}
          orderId={ordersCheckoutId ?? checkoutOrderId!}
          onClose={(completed) => {
            setCheckoutOpen(false)
            if (ordersCheckoutId) {
              setOrdersCheckoutId(null)
              void client.invalidateQueries({ queryKey: ['orders'] })
              return
            }
            requestAnimationFrame(() => submitButton.current?.focus())
            if (completed) {
              if (appendDelivery) {
                onReturn?.()
                return
              }
              if (savedPickup) void pickupOrder.refetch()
              setCheckoutOrderId(null)
              setPanel('menu')
              setDining(null)
              setConfirmedOrder(null)
              orderForm.current?.reset()
              operation.reset()
            } else if (appendDelivery) void refreshAppend()
          }}
        />
      )}
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
