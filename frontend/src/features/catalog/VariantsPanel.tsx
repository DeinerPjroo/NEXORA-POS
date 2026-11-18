import { lazy, Suspense, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers3, Pencil, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, Modal } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from './catalog-ui'
import { VariantEditor } from './VariantEditor'
import type { CatalogPage, Product, Variant } from './types'

const ContextPricesPanel = lazy(() =>
  import('./ContextPricesPanel').then((module) => ({ default: module.ContextPricesPanel })),
)

export function VariantsPanel({ product }: { product: Product }) {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Variant | 'new' | null>(null)
  const [pricing, setPricing] = useState<Variant | null>(null)
  const can = useCan()
  const { session } = useSession()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['variants', product.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<Variant>>(`products/${product.id}/variants?page=${page}&per_page=10`, {
        signal,
      }),
  })
  return (
    <section className="panel variants-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DIFERENTES FORMAS DE DISFRUTARLO</p>
          <h2>
            <Layers3 size={19} />
            Presentaciones y variantes
          </h2>
        </div>
        {can('catalog.manage') && (
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={16} />
            Nueva variante
          </button>
        )}
      </div>
      <p className="muted variant-intro">
        Crea tamaños, porciones o presentaciones. Si hay variantes, cada pedido deberá elegir una
        presentación disponible.
      </p>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="picker-loading">
          <Loading />
        </div>
      ) : (
        <>
          {query.data.data.length ? (
            <div className="table-scroll">
              <table className="variant-table">
                <thead>
                  <tr>
                    <th>Presentación</th>
                    <th>Precio</th>
                    {can('catalog.costs') && <th>Costo de referencia</th>}
                    <th>Estado manual</th>
                    <th>Precios por contexto</th>
                    {can('catalog.manage') && (
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((variant) => (
                    <tr key={variant.id}>
                      <td>
                        <strong>{variant.name}</strong>
                        <small>{variant.sku}</small>
                        {variant.barcode && <small>{variant.barcode}</small>}
                      </td>
                      <td>
                        {formatMoney(
                          variant.sale_price,
                          session!.company.currency,
                          session!.company.locale,
                        )}
                      </td>
                      {can('catalog.costs') && (
                        <td>
                          {variant.cost_price !== undefined
                            ? formatMoney(
                                variant.cost_price,
                                session!.company.currency,
                                session!.company.locale,
                              )
                            : '—'}
                        </td>
                      )}
                      <td>
                        <span
                          className={`pill ${variant.is_active && variant.is_available ? 'green' : 'neutral'}`}
                        >
                          {!variant.is_active
                            ? 'Inactiva'
                            : variant.is_available
                              ? 'Disponible'
                              : 'Agotada'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          aria-label={`Precios de ${variant.name}`}
                          onClick={() => setPricing(variant)}
                        >
                          Ver precios
                        </button>
                      </td>
                      {can('catalog.manage') && (
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Editar variante ${variant.name}`}
                            onClick={() => setEditing(variant)}
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="variant-empty">
              <Layers3 size={26} />
              <h3>Una sola presentación, por ahora.</h3>
              <p>
                Se utiliza el precio base del producto. Agrega variantes si tu menú necesita más
                opciones.
              </p>
            </div>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <VariantEditor
          product={product}
          variant={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
            void client.invalidateQueries({ queryKey: ['product', product.id] })
            void query.refetch()
          }}
        />
      )}
      {pricing && (
        <Modal title={`Precios · ${pricing.name}`} onClose={() => setPricing(null)}>
          <Suspense fallback={<Loading />}>
            <ContextPricesPanel product={product} variant={pricing} />
          </Suspense>
        </Modal>
      )}
    </section>
  )
}
