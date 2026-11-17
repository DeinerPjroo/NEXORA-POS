import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Package, Pencil, Plus, Search, Tags } from 'lucide-react'
import { api } from '../../lib/api'
import { useCan } from '../auth/SessionProvider'
import { Loading, PageTitle } from '../../components/ui'
import { CategoryEditor } from './CategoryEditor'
import { CatalogEmpty, CatalogError, Pagination, useDebounce } from './catalog-ui'
import type { CatalogPage, Category } from './types'

export function CategoriesPage() {
  const can = useCan()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const text = useDebounce(search)
  const params = new URLSearchParams({ page: String(page), per_page: '12' })
  if (text) params.set('search', text)
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['categories', 'list', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Category>>(`categories?${params}`, { signal }),
  })
  return (
    <>
      <PageTitle
        eyebrow="UN MENÚ CON PERSONALIDAD"
        title="Categorías"
        description="Organiza tu oferta. Dale un lugar a cada sabor."
        action={
          can('catalog.manage') && (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={17} />
              Nueva categoría
            </button>
          )
        }
      />
      <div className="catalog-section-nav">
        <Link to="/productos">
          <Package size={16} />
          Productos
          <ArrowUpRight size={14} />
        </Link>
        <span>
          <Tags size={16} />
          Categorías
        </span>
      </div>
      <div className="catalog-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Buscar categorías"
            placeholder="Busca una categoría…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          aria-label="Estado de categorías"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          {query.data.data.length ? (
            <div className="category-grid">
              {query.data.data.map((category) => (
                <article className="panel category-card" key={category.id}>
                  <div className="category-card-top">
                    <span
                      className="category-symbol"
                      style={{ color: category.color, background: `${category.color}16` }}
                    >
                      <Tags size={24} />
                    </span>
                    <span className={`pill ${category.is_active ? 'green' : 'neutral'}`}>
                      {category.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <h2>{category.name}</h2>
                  <p>
                    {category.description || 'Cada producto cuenta una historia. Agrúpalos aquí.'}
                  </p>
                  <div className="category-card-footer">
                    <span>
                      <Package size={14} />
                      {category.products_count} productos
                    </span>
                    {can('catalog.manage') && (
                      <button
                        className="text-button"
                        aria-label={`Editar categoría ${category.name}`}
                        onClick={() => setEditing(category)}
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CatalogEmpty filtered={Boolean(text || status)} />
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <CategoryEditor
          category={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
            void query.refetch()
          }}
        />
      )}
    </>
  )
}
