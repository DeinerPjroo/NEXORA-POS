import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Package, Pencil, Plus, Search, Tags, UtensilsCrossed } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { useCan, useSession } from '../auth/SessionProvider'
import { Loading, PageTitle } from '../../components/ui'
import { ProductEditor } from './ProductEditor'
import { CategoryPicker } from './CategoryPicker'
import { CatalogEmpty, CatalogError, Pagination, useDebounce } from './catalog-ui'
import type { CatalogPage, CategorySummary, Product } from './types'
import { categoryPath, productStatus } from './types'

export function ProductsPage() {
  const can = useCan()
  const { session } = useSession()
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [availability, setAvailability] = useState('')
  const [category, setCategory] = useState<CategorySummary | null>(null)
  const [page, setPage] = useState(1)
  const text = useDebounce(search)
  const params = new URLSearchParams({ page: String(page), per_page: '12' })
  if (text) params.set('search', text)
  if (status) params.set('status', status)
  if (availability) params.set('availability', availability)
  if (category) params.set('category_id', String(category.id))
  const query = useQuery({
    queryKey: ['products', 'list', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Product>>(`products?${params}`, { signal }),
  })
  function clearFilters() {
    setSearch('')
    setStatus('')
    setAvailability('')
    setCategory(null)
    setPage(1)
  }
  const filtered = Boolean(text || status || availability || category)
  return (
    <>
      <PageTitle
        eyebrow="EL SABOR DE TU NEGOCIO"
        title="Tu catálogo"
        description="Cada plato, bebida y detalle que hace especial a tu restaurante."
        action={
          can('catalog.manage') && (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={17} />
              Nuevo producto
            </button>
          )
        }
      />
      <div className="catalog-section-nav">
        <span>
          <Package size={16} />
          Productos
        </span>
        <Link to="/categorias">
          <Tags size={16} />
          Categorías
          <ArrowUpRight size={14} />
        </Link>
        <small>{session!.company.currency} · Precios de catálogo</small>
      </div>
      <div className="catalog-toolbar products-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Buscar productos"
            placeholder="Buscar producto, SKU o código de barras…"
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
        <select
          aria-label="Estado de productos"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <select
          aria-label="Disponibilidad de productos"
          value={availability}
          onChange={(event) => {
            setAvailability(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Disponibilidad</option>
          <option value="available">No agotados</option>
          <option value="unavailable">Agotados</option>
        </select>
      </div>
      {category && !category.parent_id && (
        <p className="muted small">Esta categoría principal incluye sus subcategorías.</p>
      )}
      {filtered && (
        <button className="text-button clear-filters" onClick={clearFilters}>
          Limpiar filtros
        </button>
      )}
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          {query.data.data.length ? (
            <div className="product-grid">
              {query.data.data.map((product) => (
                <article className="panel product-card" key={product.id}>
                  <div
                    className="product-art"
                    style={{ '--category-color': product.category.color } as React.CSSProperties}
                  >
                    {product.image_url ? (
                      <img
                        className="product-card-photo"
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                      />
                    ) : (
                      <UtensilsCrossed size={38} strokeWidth={1.3} />
                    )}
                    <span className={`pill ${product.sellable ? 'green' : 'neutral'}`}>
                      {productStatus(product)}
                    </span>
                    <span className="product-art-lines" aria-hidden="true" />
                  </div>
                  <div className="product-card-body">
                    <span className="product-category">
                      <i style={{ background: product.category.color }} />
                      {categoryPath(product.category)}
                    </span>
                    <h2>{product.name}</h2>
                    <p className="product-description">
                      {product.description || 'Sin descripción adicional.'}
                    </p>
                    <span className="product-sku">{product.sku}</span>
                    {product.variants_count > 0 && (
                      <span className="product-variant-hint">
                        Precio base · {product.variants_count} variantes
                      </span>
                    )}
                    <div className="product-price-row">
                      <strong>
                        {formatMoney(
                          product.sale_price,
                          session!.company.currency,
                          session!.company.locale,
                        )}
                      </strong>
                      {can('catalog.manage') && (
                        <button
                          className="icon-button"
                          aria-label={`Editar producto ${product.name}`}
                          onClick={() => setEditing(product)}
                        >
                          <Pencil size={17} />
                        </button>
                      )}
                    </div>
                    {can('catalog.costs') && product.cost_price !== undefined && (
                      <small className="product-cost">
                        Costo de referencia:{' '}
                        {formatMoney(
                          product.cost_price,
                          session!.company.currency,
                          session!.company.locale,
                        )}
                      </small>
                    )}
                    <Link
                      className="text-button product-detail-link"
                      to={`/productos/${product.id}`}
                    >
                      Ver ficha y presentaciones
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CatalogEmpty filtered={filtered}>
              {!filtered && (
                <Link className="button secondary" to="/categorias">
                  Organizar mis categorías
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </CatalogEmpty>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
            void query.refetch()
          }}
        />
      )}
    </>
  )
}
