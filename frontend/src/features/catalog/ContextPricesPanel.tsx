import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loading } from '../../components/ui'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from './catalog-ui'
import { ContextPriceEditor } from './ContextPriceEditor'
import { channelLabels } from './context-price-types'
import type { ContextPrice } from './context-price-types'
import type { CatalogPage, Product, Variant } from './types'

export function ContextPricesPanel({ product, variant }: { product: Product; variant?: Variant }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<ContextPrice | 'new' | null>(null)
  const can = useCan()
  const { session } = useSession()
  const params = new URLSearchParams({ page: String(page), per_page: '10' })
  if (variant) params.set('variant_id', String(variant.id))
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['context-prices', product.id, variant?.id ?? 0, params.toString()],
    queryFn: ({ signal }) =>
      api<CatalogPage<ContextPrice> & { product_revision: number }>(
        `products/${product.id}/context-prices?${params}`,
        { signal },
      ),
  })
  const current = !!query.data && query.data.product_revision === product.revision
  return (
    <section className="panel variants-panel">
      <div className="panel-heading">
        <h2>Precios por sucursal y canal{variant ? ` · ${variant.name}` : ''}</h2>
        {can('catalog.manage') && (
          <button
            className="button primary"
            disabled={!current || (!variant && product.variants_count > 0)}
            onClick={() => setEditing('new')}
          >
            Nuevo precio
          </button>
        )}
      </div>
      <p className="muted small">
        Se aplican a pedidos nuevos. Las reglas archivadas y los precios de pedidos anteriores se
        conservan.
      </p>
      {!variant && product.variants_count > 0 && (
        <p className="notice">
          Este producto utiliza presentaciones. Configura sus precios desde cada variante; las
          reglas del producto base no se aplican a ellas.
        </p>
      )}
      <label className="field">
        <span>Estado de precios</span>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Archivados</option>
        </select>
      </label>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          {!current && (
            <p className="notice">Actualiza la ficha del producto antes de editar estos precios.</p>
          )}
          {query.data.data.length ? (
            <div className="table-scroll">
              <table className="variant-table">
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th>Canal</th>
                    <th>Importe</th>
                    <th>Estado</th>
                    {can('catalog.manage') && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((price) => (
                    <tr key={price.id}>
                      <td>
                        {price.branch?.name ?? 'Todas las sucursales'}
                        {price.branch && !price.branch.is_active && (
                          <small>Sucursal inactiva</small>
                        )}
                      </td>
                      <td>{channelLabels[price.channel]}</td>
                      <td>{formatMoney(price.amount, session!.company.currency)}</td>
                      <td>{price.is_active ? 'Activa' : 'Archivada'}</td>
                      {can('catalog.manage') && (
                        <td>
                          <button
                            className="text-button"
                            aria-label={`Editar precio ${price.branch?.name ?? 'Todas las sucursales'} ${channelLabels[price.channel]}`}
                            disabled={!current}
                            onClick={() => setEditing(price)}
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-inline muted">Sin reglas de precio. Se utiliza el precio base.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <ContextPriceEditor
          product={product}
          variant={variant}
          price={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
