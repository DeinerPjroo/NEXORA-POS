import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Loading, Modal } from '../../components/ui'
import { CatalogError, Pagination, useDebounce } from './catalog-ui'
import type { CatalogPage, Product } from './types'

export function ComboProductPicker({
  onPick,
  onClose,
  title = 'Elegir producto del componente',
}: {
  onPick: (product: Product) => void
  onClose: () => void
  title?: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [instance] = useState(() => crypto.randomUUID())
  const text = useDebounce(search)
  const params = new URLSearchParams({
    kind: 'regular',
    status: 'active',
    per_page: '10',
    page: String(page),
    search: text,
  })
  const query = useQuery({
    queryKey: ['products', 'combo-picker', params.toString(), instance],
    queryFn: ({ signal }) => api<CatalogPage<Product>>(`products?${params}`, { signal }),
    gcTime: 0,
  })
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-stack">
        <input
          aria-label="Buscar componente"
          value={search}
          placeholder="Nombre o código del producto…"
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        {query.error ? (
          <CatalogError error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <Loading />
        ) : (
          <>
            <div className="order-variant-options">
              {query.data.data.map((product) => (
                <button
                  type="button"
                  className="order-variant-option"
                  key={product.id}
                  disabled={query.isFetching}
                  onClick={() => onPick(product)}
                >
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.sku} ·{' '}
                      {product.variants_count
                        ? `${product.variants_count} presentaciones`
                        : 'Presentación única'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {!query.data.data.length && (
              <p className="muted">Sin productos individuales coincidentes.</p>
            )}
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          </>
        )}
      </div>
    </Modal>
  )
}
