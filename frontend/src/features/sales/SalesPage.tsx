import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, ReceiptText, Settings2 } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import type { Sale } from './types'
import { saleStates } from './types'

export function SalesPage() {
  const context = useOperationContext()
  const can = useCan()
  const { session } = useSession()
  const [branch, setBranch] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const selected =
    branch ??
    context.data?.branches.find((item) => item.is_active)?.id ??
    context.data?.branches[0]?.id ??
    null
  const params = new URLSearchParams({
    branch_id: String(selected),
    page: String(page),
    per_page: '12',
  })
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['sales', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Sale>>(`sales?${params}`, { signal }),
    enabled: selected !== null,
  })
  return (
    <>
      <PageTitle
        eyebrow="CADA COBRO, CON SU HISTORIA"
        title="Ventas"
        description="Recibos internos, pagos manuales y devoluciones. Consulta los registros de cada sucursal."
        action={
          can('sales.configure') && (
            <div className="operation-actions">
              <Link className="button secondary" to="/ventas/impuestos">
                Perfiles de impuestos
              </Link>
              <Link className="button secondary" to="/ventas/metodos">
                Métodos de pago
              </Link>
              <Link className="button secondary" to="/ventas/configuracion">
                <Settings2 size={17} />
                Configurar ventas
              </Link>
            </div>
          )
        }
      />
      <div className="operation-toolbar">
        <OperationalBranchPicker
          branches={context.data?.branches ?? []}
          value={selected}
          onChange={(id) => {
            setBranch(id)
            setPage(1)
          }}
        />
        <select
          className="order-state-filter"
          aria-label="Filtrar estado de ventas"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          <option value="paid">Cobradas</option>
          <option value="partially_paid">Abonadas</option>
          <option value="partially_refunded">Con devolución parcial</option>
          <option value="refunded">Devueltas</option>
        </select>
        {can('orders.view') && (
          <Link className="text-button" to="/pedidos">
            Ir a pedidos <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
      {context.error || query.error ? (
        <CatalogError
          error={context.error || query.error}
          onRetry={() => {
            void context.refetch()
            void query.refetch()
          }}
        />
      ) : context.data && !selected ? (
        <p className="notice">No hay sucursales disponibles.</p>
      ) : query.isPending ? (
        <Loading />
      ) : query.data.data.length ? (
        <section className="panel sales-list-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Recibo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total original</th>
                  <th>
                    <span className="sr-only">Consultar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <strong>{sale.receipt_code}</strong>
                      <small className="sale-order-id">Pedido #{sale.order_id}</small>
                    </td>
                    <td>
                      {new Intl.DateTimeFormat('es-CO', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: session!.company.timezone,
                      }).format(new Date(sale.created_at))}
                    </td>
                    <td>
                      <span className={`pill ${sale.status === 'paid' ? 'green' : 'neutral'}`}>
                        {saleStates[sale.status]}
                      </span>
                    </td>
                    <td>{formatMoney(sale.total, sale.currency)}</td>
                    <td>
                      <Link className="text-button" to={`/ventas/${sale.id}`}>
                        Ver recibo <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </section>
      ) : (
        <div className="panel empty-state">
          <ReceiptText size={36} />
          <h2>Las ventas empiezan con un pedido.</h2>
          <p>Cuando confirmes un cobro aparecerán su recibo y el movimiento de caja.</p>
          {can('orders.view') && (
            <Link className="button primary" to="/pedidos">
              Ver pedidos
            </Link>
          )}
        </div>
      )}
    </>
  )
}
