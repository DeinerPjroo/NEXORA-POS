import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Undo2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Loading, PageTitle } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { CatalogError } from '../catalog/catalog-ui'
import { RefundModal } from './RefundModal'
import { SaleReceipt } from './SaleReceipt'
import type { Sale } from './types'

export function SaleDetailPage() {
  const { saleId = '' } = useParams()
  const can = useCan()
  const [refund, setRefund] = useState(false)
  const query = useQuery({
    queryKey: ['sale', Number(saleId)],
    queryFn: ({ signal }) => api<{ data: Sale }>(`sales/${encodeURIComponent(saleId)}`, { signal }),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <CatalogError error={query.error} onRetry={() => void query.refetch()} />
  const sale = query.data.data
  return (
    <div className="sale-detail-page">
      <Link className="text-button product-back" to="/ventas">
        <ArrowLeft size={16} />
        Volver a ventas
      </Link>
      <PageTitle
        eyebrow="UN REGISTRO QUE SE CONSERVA"
        title={`Recibo ${sale.receipt_code}`}
        description={`${sale.branch_name} · ${sale.status === 'paid' ? 'Venta cobrada en efectivo' : 'Venta con devolución total'}`}
        action={
          <div className="operation-actions">
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Imprimir recibo
            </button>
            {sale.status === 'paid' && can('sales.refund') && (
              <button className="button secondary" onClick={() => setRefund(true)}>
                <Undo2 size={16} />
                Devolución total
              </button>
            )}
          </div>
        }
      />
      <SaleReceipt sale={sale} />
      {can('orders.view') && (
        <Link className="text-button receipt-order-link" to={`/pedidos/${sale.order_id}`}>
          Ver pedido original
        </Link>
      )}
      {refund && sale.status === 'paid' && (
        <RefundModal sale={sale} onClose={() => setRefund(false)} />
      )}
    </div>
  )
}
