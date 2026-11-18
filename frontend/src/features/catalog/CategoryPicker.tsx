import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Search, Tag } from 'lucide-react'
import { api } from '../../lib/api'
import { Loading, Modal } from '../../components/ui'
import { CatalogError, Pagination, useDebounce } from './catalog-ui'
import type { CatalogPage, Category, CategorySummary } from './types'
import { categoryPath } from './types'

export function CategoryPicker({
  value,
  onChange,
  allowAll = false,
  rootsOnly = false,
  excludeId,
  disabled = false,
}: {
  value: CategorySummary | null
  onChange: (category: CategorySummary | null) => void
  allowAll?: boolean
  rootsOnly?: boolean
  excludeId?: number
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="category-picker">
      <button
        type="button"
        className="category-picker-trigger"
        aria-label={`${rootsOnly ? 'Categoría principal' : 'Categoría'}: ${value ? categoryPath(value) : rootsOnly ? 'Sin principal' : allowAll ? 'Todas' : 'Elegir categoría'}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Tag size={16} />
        <span>
          {value
            ? categoryPath(value)
            : rootsOnly
              ? 'Sin categoría principal'
              : allowAll
                ? 'Todas las categorías'
                : 'Elegir categoría'}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <CategoryChoices
          value={value}
          allowAll={allowAll}
          rootsOnly={rootsOnly}
          excludeId={excludeId}
          onClose={() => setOpen(false)}
          onChange={(category) => {
            onChange(category)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function CategoryChoices({
  value,
  onChange,
  allowAll,
  onClose,
  rootsOnly,
  excludeId,
}: {
  value: CategorySummary | null
  onChange: (category: CategorySummary | null) => void
  allowAll: boolean
  onClose: () => void
  rootsOnly: boolean
  excludeId?: number
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const queryText = useDebounce(search)
  const query = useQuery({
    queryKey: ['categories', 'picker', rootsOnly, queryText, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<Category>>(
        `categories?${new URLSearchParams({ search: queryText, page: String(page), per_page: '10', ...(rootsOnly ? { level: 'root' } : {}) })}`,
        { signal },
      ),
  })
  return (
    <Modal
      title={rootsOnly ? 'Elige una categoría principal' : 'Elige una categoría'}
      onClose={onClose}
    >
      <div className="search-input picker-search">
        <Search size={17} />
        <input
          aria-label="Buscar categoría"
          placeholder="Busca en tus categorías…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          autoFocus
        />
      </div>
      {allowAll && (
        <button type="button" className="category-choice" onClick={() => onChange(null)}>
          <Tag size={17} />
          <span>{rootsOnly ? 'Sin categoría principal' : 'Todas las categorías'}</span>
          {!value && <Check size={17} />}
        </button>
      )}
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="picker-loading">
          <Loading />
        </div>
      ) : (
        <>
          <div className="category-choice-list">
            {query.data.data.map((category) => (
              <button
                type="button"
                className="category-choice"
                key={category.id}
                disabled={category.id === excludeId}
                onClick={() => onChange(category)}
              >
                <i style={{ background: category.color }} />
                <span>{categoryPath(category)}</span>
                {!category.effective_active && (
                  <small>{category.is_active ? 'Principal inactiva' : 'Inactiva'}</small>
                )}
                {value?.id === category.id && <Check size={17} />}
              </button>
            ))}
            {!query.data.data.length && (
              <p className="empty-inline muted">
                No encontramos categorías. Crea una desde la sección Categorías.
              </p>
            )}
          </div>
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
    </Modal>
  )
}
