import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Layers3 } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, Modal } from '../../components/ui'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage, Product, Variant } from '../catalog/types'

export function VariantOrderPicker({
  product,
  currency,
  onPick,
  onClose,
}: {
  product: Product
  currency: string
  onPick: (variant: Variant) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['variants', 'order-picker', product.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<Variant>>(
        `products/${product.id}/variants?status=active&availability=available&page=${page}&per_page=10`,
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
          <div className="order-variant-options">
            {query.data.data.map((variant) => (
              <button
                key={variant.id}
                className="order-variant-option"
                onClick={() => onPick(variant)}
              >
                <Layers3 size={19} />
                <span>
                  <strong>{variant.name}</strong>
                  <small>{variant.sku}</small>
                </span>
                <b>{formatMoney(variant.sale_price, currency)}</b>
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
