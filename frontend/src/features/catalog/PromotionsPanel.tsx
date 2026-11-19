import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loading } from '../../components/ui'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from './catalog-ui'
import { PromotionEditor } from './PromotionEditor'
import { channelLabels } from './context-price-types'
import type { Promotion } from './promotion-types'
import type { CatalogPage, Product, Variant } from './types'

export function PromotionsPanel({ product, variant }: { product: Product; variant?: Variant }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const can = useCan()
  const { session } = useSession()
  const params = new URLSearchParams({ page: String(page), per_page: '10' })
  if (variant) params.set('variant_id', String(variant.id))
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['promotions', product.id, variant?.id ?? 0, params.toString()],
    queryFn: ({ signal }) =>
      api<CatalogPage<Promotion> & { product_revision: number }>(
        `products/${product.id}/promotions?${params}`,
        { signal },
      ),
  })
  const current = query.data?.product_revision === product.revision
  return (
    <section className="panel variants-panel">
      <div className="panel-heading">
        <h2>Promociones{variant ? ` · ${variant.name}` : ''}</h2>
        {can('catalog.manage') && (
          <button
            className="button primary"
            disabled={!current || (!variant && product.variants_count > 0)}
            onClick={() => setEditing('new')}
          >
            Nueva promoción
          </button>
        )}
      </div>
      <p className="muted small">
        Una promoción sobre la base contextual antes de adicionales; no se acumulan entre sí.
        Contexto más específico, menor prioridad y, en empate, regla más antigua. Los pedidos
        guardados conservan su precio.
      </p>
      {!variant && product.variants_count > 0 && (
        <p className="notice">
          Configura promociones propias desde «Ver precios» de cada variante. Las del producto base
          no se heredan.
        </p>
      )}
      <label className="field">
        <span>Estado de promociones</span>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Archivadas</option>
        </select>
      </label>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          {!current && <p className="notice">Actualiza la ficha antes de editar promociones.</p>}
          {query.data.data.length ? (
            <div className="table-scroll">
              <table className="variant-table">
                <thead>
                  <tr>
                    <th>Promoción</th>
                    <th>Contexto</th>
                    <th>Descuento de base</th>
                    <th>Vigencia y prioridad</th>
                    <th>Estado</th>
                    {can('catalog.manage') && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((promotion) => (
                    <tr key={promotion.id}>
                      <td>
                        <strong>{promotion.name}</strong>
                      </td>
                      <td>
                        {promotion.branch?.name ?? 'Todas las sucursales'}
                        <small>{channelLabels[promotion.channel]}</small>
                      </td>
                      <td>
                        {promotion.discount_type === 'percentage'
                          ? `${promotion.discount_value.replace(/\.?0+$/, '')} %`
                          : formatMoney(promotion.discount_value, session!.company.currency)}
                      </td>
                      <td>
                        {promotion.valid_from ?? 'Sin inicio'} –{' '}
                        {promotion.valid_until ?? 'Sin final'}
                        <small>Prioridad {promotion.priority}</small>
                      </td>
                      <td>{promotion.is_active ? 'Activa' : 'Archivada'}</td>
                      {can('catalog.manage') && (
                        <td>
                          <button
                            className="text-button"
                            aria-label={`Editar promoción ${promotion.name}`}
                            disabled={!current}
                            onClick={() => setEditing(promotion)}
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
            <p className="empty-inline muted">
              Sin promociones configuradas para esta presentación.
            </p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <PromotionEditor
          product={product}
          variant={variant}
          promotion={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
