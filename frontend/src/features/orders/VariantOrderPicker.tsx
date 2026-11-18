import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Layers3 } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, Modal } from '../../components/ui'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage, Product, Variant } from '../catalog/types'
import type { OrderChannel } from '../catalog/context-price-types'
import { contextualPrice } from './cart'

export function VariantOrderPicker({
  product,
  currency,
  branchId,
  channel,
  onPick,
  onClose,
  onRefresh,
}: {
  product: Product
  currency: string
  branchId: number
  channel: OrderChannel
  onPick: (variant: Variant) => void
  onClose: () => void
  onRefresh: () => void
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['variants', 'order-picker', product.id, page, branchId, channel],
    queryFn: ({ signal }) =>
      api<CatalogPage<Variant> & { product_revision: number }>(
        `products/${product.id}/variants?status=active&availability=available&page=${page}&per_page=10&branch_id=${branchId}&channel=${channel}`,
        { signal },
      ),
  })
  return (
    <Modal title={`Elige la presentación · ${product.name}`} onClose={onClose}>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="picker-loading">
          <Loading />
        </div>
      ) : (
        <>
          {query.data.product_revision !== product.revision && (
            <p className="notice">
              El producto cambió.{' '}
              <button type="button" className="text-button" onClick={onRefresh}>
                Actualizar catálogo
              </button>
            </p>
          )}
          <div className="order-variant-options">
            {query.data.data.map((variant) => (
              <button
                key={variant.id}
                className="order-variant-option"
                disabled={query.data.product_revision !== product.revision}
                onClick={() => onPick(variant)}
              >
                <Layers3 size={19} />
                <span>
                  <strong>{variant.name}</strong>
                  <small>{variant.sku}</small>
                </span>
                <b>{formatMoney(contextualPrice(product, variant), currency)}</b>
                <Check size={17} />
              </button>
            ))}
            {!query.data.data.length && (
              <p className="empty-inline muted">No hay presentaciones disponibles.</p>
            )}
          </div>
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
    </Modal>
  )
}
