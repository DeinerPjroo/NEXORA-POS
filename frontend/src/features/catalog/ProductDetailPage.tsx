import { lazy, Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Tag } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError } from './catalog-ui'
import { ProductEditor } from './ProductEditor'
import { ProductImagePanel } from './ProductImagePanel'
import { VariantsPanel } from './VariantsPanel'
import { categoryPath, productStatus } from './types'
import type { Product } from './types'
import { taxSummary } from '../sales/tax-types'

const ProductModifiersPanel = lazy(() =>
  import('./ProductModifiersPanel').then((module) => ({ default: module.ProductModifiersPanel })),
)

export function ProductDetailPage() {
  const { productId = '' } = useParams()
  const can = useCan()
  const { session } = useSession()
  const [editing, setEditing] = useState(false)
  const query = useQuery({
    queryKey: ['product', Number(productId)],
    queryFn: ({ signal }) =>
      api<{ data: Product }>(`products/${encodeURIComponent(productId)}`, { signal }),
  })
  if (query.isPending) return <Loading />
  if (query.error)
    return (
      <>
        <Link className="text-button" to="/productos">
          <ArrowLeft size={16} />
          Volver al catálogo
        </Link>
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      </>
    )
  const product = query.data.data
  return (
    <>
      <Link className="text-button product-back" to="/productos">
        <ArrowLeft size={16} />
        Volver al catálogo
      </Link>
      <PageTitle
        eyebrow="CADA DETALLE CUENTA"
        title={product.name}
        description="Su identidad, sus presentaciones y todo lo que lo hace especial."
        action={
          can('catalog.manage') && (
            <button className="button secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} />
              Editar datos
            </button>
          )
        }
      />
      <div className="product-detail-grid">
        <ProductImagePanel product={product} />
        <section className="panel product-summary">
          <div className="panel-heading">
            <h2>La esencia del producto</h2>
            <span className={`pill ${product.sellable ? 'green' : 'neutral'}`}>
              {productStatus(product)}
            </span>
          </div>
          <span className="product-category detail-category">
            <Tag size={15} />
            <i style={{ background: product.category.color }} />
            {categoryPath(product.category)}
          </span>
          <p className="detail-description">
            {product.description ||
              'Agrega una descripción para compartir lo que hace especial a tu producto.'}
          </p>
          <dl className="product-facts">
            <div>
              <dt>SKU del producto</dt>
              <dd>{product.sku}</dd>
            </div>
            <div>
              <dt>Código de barras</dt>
              <dd>{product.barcode || 'Sin registrar'}</dd>
            </div>
            <div>
              <dt>{product.variants_count ? 'Precio base de referencia' : 'Precio de venta'}</dt>
              <dd>
                {formatMoney(
                  product.sale_price,
                  session!.company.currency,
                  session!.company.locale,
                )}
              </dd>
            </div>
            {can('catalog.costs') && product.cost_price !== undefined && (
              <div>
                <dt>Costo de referencia</dt>
                <dd>
                  {formatMoney(
                    product.cost_price,
                    session!.company.currency,
                    session!.company.locale,
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt>Presentaciones registradas</dt>
              <dd>{product.variants_count || 'Presentación única'}</dd>
            </div>
          </dl>
          <p className="muted small">
            La disponibilidad se configura manualmente. El control automático de ingredientes e
            inventario se incorporará posteriormente.
          </p>
        </section>
      </div>
      <VariantsPanel product={product} />
      <Suspense fallback={<Loading />}>
        <ProductModifiersPanel product={product} />
      </Suspense>
      <section className="panel receipt-refund">
        <h2>Perfil de impuestos del producto</h2>
        <p>
          {product.tax_profile
            ? `${product.tax_profile.name} · ${taxSummary(product.tax_profile)}`
            : 'Sin perfil de impuestos asignado.'}
        </p>
        <p className="muted small">
          El cálculo depende del modo confirmado en Ventas. Los pedidos guardan el perfil y las
          variantes lo heredan del producto.
        </p>
      </section>
      {editing && (
        <ProductEditor
          product={product}
          onClose={() => {
            setEditing(false)
            void query.refetch()
          }}
        />
      )}
    </>
  )
}
