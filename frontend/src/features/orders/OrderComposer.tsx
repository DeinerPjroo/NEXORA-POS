import { useState } from 'react'
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
import { cartSubtotal, makeLine } from './cart'
import type { CartLine } from './cart'

export function OrderComposer() {
  const context = useOperationContext()
  const { session } = useSession()
  const [currency] = useState(session!.company.currency)
  const [branch, setBranch] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategorySummary | null>(null)
  const [page, setPage] = useState(1)
  const [picking, setPicking] = useState<Product | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const can = useCan()
  const navigate = useNavigate()
  const client = useQueryClient()
  const toast = useToast()
  const text = useDebounce(search)
  const activeBranches = context.data?.branches.filter((item) => item.is_active) ?? []
  const selected = branch ?? activeBranches[0]?.id ?? null
  const params = new URLSearchParams({
    status: 'active',
    availability: 'available',
    page: String(page),
    per_page: '12',
  })
  if (text) params.set('search', text)
  if (category) params.set('category_id', String(category.id))
  const products = useQuery({
    queryKey: ['products', 'order-menu', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Product>>(`products?${params}`, { signal }),
    enabled: can('catalog.view'),
  })
  const operation = useOperation<Order>('orders', async (order) => {
    await client.invalidateQueries({ queryKey: ['orders'] })
    toast('Pedido registrado. No se ha realizado ningún cobro.')
    if (can('orders.view')) navigate(`/pedidos/${order.id}`)
    else {
      setCart([])
    }
  })
  function add(product: Product, variant?: Variant) {
    if (operation.locked) return
    const line = makeLine(product, variant)
    setCart((previous) => {
      const existing = previous.find((item) => item.key === line.key)
      return existing
        ? previous.map((item) =>
            item.key === line.key ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item,
          )
        : [...previous, line]
    })
    setPicking(null)
  }
  function quantity(key: string, value: number) {
    if (!operation.locked)
      setCart((previous) =>
        previous.map((line) =>
          line.key === key ? { ...line, quantity: Math.max(1, Math.min(999, value)) } : line,
        ),
      )
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !cart.length) return
    const data = Object.fromEntries(new FormData(event.currentTarget))
    operation.send({
      ...data,
      branch_id: selected,
      currency,
      items: cart.map(
        ({ key: _key, product_name: _name, variant_name: _variant, ...line }) => line,
      ),
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
    <>
      <Link className="text-button product-back" to="/pedidos">
        <ArrowLeft size={16} />
        Volver a pedidos
      </Link>
      <PageTitle
        eyebrow="CADA PEDIDO EMPIEZA AQUÍ"
        title="Tomar pedido"
        description="Elige, personaliza las observaciones y envía. Todo queda registrado."
      />
      <ErrorNotice error={context.error} />
      <div className="operation-toolbar">
        <OperationalBranchPicker
          branches={activeBranches}
          value={selected}
          onChange={setBranch}
          disabled={operation.locked}
        />
        <span className="pill neutral">Sin cobro registrado</span>
      </div>
      <div className="order-composer">
        <section className="order-menu">
          <div className="catalog-toolbar">
            <div className="search-input">
              <Search size={17} />
              <input
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
          {products.error ? (
            <CatalogError error={products.error} onRetry={() => void products.refetch()} />
          ) : products.isPending ? (
            <Loading />
          ) : (
            <>
              {products.data.data.length ? (
                <div className="order-menu-grid">
                  {products.data.data.map((product) => (
                    <button
                      className="panel order-product"
                      key={product.id}
                      disabled={!product.sellable || operation.locked}
                      onClick={() =>
                        product.variants_count > 0 ? setPicking(product) : add(product)
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
                      <small>
                        {product.variants_count
                          ? `${product.available_variants_count} presentaciones disponibles`
                          : categoryPath(product.category)}
                      </small>
                      <span>
                        {product.variants_count
                          ? 'Elegir presentación'
                          : formatMoney(product.sale_price, currency)}
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
          <OperationNotice uncertain={operation.uncertain} />
          {cart.length ? (
            <div className="cart-lines">
              {cart.map((line) => (
                <div className="cart-line" key={line.key}>
                  <div className="cart-line-title">
                    <div>
                      <strong>{line.product_name}</strong>
                      {line.variant_name && <small>{line.variant_name}</small>}
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Quitar ${line.product_name}`}
                      disabled={operation.locked}
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
                        disabled={line.quantity <= 1 || operation.locked}
                        onClick={() => quantity(line.key, line.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Sumar ${line.product_name}`}
                        disabled={line.quantity >= 999 || operation.locked}
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
                    disabled={operation.locked}
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
          <fieldset disabled={operation.locked} className="form-stack">
            <Field label="Tipo de pedido">
              <select name="channel">
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
              onClick={() => {
                setCart([])
                operation.reset()
                void products.refetch()
              }}
            >
              <RefreshCw size={15} />
              Revisar catálogo y empezar de nuevo
            </button>
          )}
          <button
            className="button primary wide"
            type="submit"
            disabled={operation.isPending || !cart.length || !selected || conflict}
          >
            <Send size={17} />
            {operation.isPending
              ? 'Registrando…'
              : operation.uncertain
                ? 'Reintentar envío'
                : 'Registrar pedido'}
          </button>
        </form>
      </div>
      {picking && (
        <VariantOrderPicker
          product={picking}
          currency={currency}
          onPick={(variant) => add(picking, variant)}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  )
}
