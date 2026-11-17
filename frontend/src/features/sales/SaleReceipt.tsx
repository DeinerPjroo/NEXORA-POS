import { formatMoney } from '../../lib/money'
import { useSession } from '../auth/SessionProvider'
import { SaleAmounts } from './SaleAmounts'
import type { Sale } from './types'

export function SaleReceipt({ sale }: { sale: Sale }) {
  const { session } = useSession()
  const date = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: session!.company.timezone,
    }).format(new Date(value))
  return (
    <article className="panel receipt-sheet" aria-label={`Recibo ${sale.receipt_code}`}>
      <header className="receipt-header">
        <span className="eyebrow">RECIBO INTERNO DE VENTA</span>
        <h2>{sale.business_name}</h2>
        <p>{sale.branch_name}</p>
        {sale.branch_address && <p>{sale.branch_address}</p>}
        <strong>{sale.receipt_code}</strong>
        <p>{date(sale.created_at)}</p>
        <span className={`pill ${sale.status === 'paid' ? 'green' : 'neutral'}`}>
          {sale.status === 'paid' ? 'Cobrada' : 'Devuelta'}
        </span>
      </header>
      <div className="receipt-reference">
        <span>Pedido #{sale.order_id}</span>
        {sale.reference && <span>{sale.reference}</span>}
        <span>{sale.currency} · Efectivo</span>
      </div>
      <div className="receipt-items">
        {sale.items?.map((item) => (
          <div className="checkout-order-line" key={item.id}>
            <div>
              <strong>
                {item.quantity}× {item.product_name}
              </strong>
              {item.variant_name && <span>{item.variant_name}</span>}
              <small>
                {item.sku} · {formatMoney(item.unit_price, sale.currency)} / unidad
              </small>
              {item.notes && <p>{item.notes}</p>}
            </div>
            <b>{formatMoney(item.line_subtotal, sale.currency)}</b>
          </div>
        ))}
      </div>
      <SaleAmounts amounts={sale} />
      {sale.discount_reason && (
        <p className="receipt-discount-note">Motivo del descuento: {sale.discount_reason}</p>
      )}
      {sale.payment && (
        <dl className="sale-amounts receipt-cash">
          <div>
            <dt>Efectivo recibido</dt>
            <dd>{formatMoney(sale.payment.received_amount, sale.currency)}</dd>
          </div>
          <div>
            <dt>Cambio entregado</dt>
            <dd>{formatMoney(sale.payment.change_amount, sale.currency)}</dd>
          </div>
          <div>
            <dt>Ingreso neto en caja</dt>
            <dd>{formatMoney(sale.payment.amount, sale.currency)}</dd>
          </div>
        </dl>
      )}
      {sale.refund && (
        <section className="receipt-refund">
          <h3>Devolución total registrada</h3>
          <strong>{formatMoney(sale.refund.amount, sale.currency)}</strong>
          <p>{sale.refund.reason}</p>
          <small>
            {date(sale.refund.created_at)} · Sesión de caja #{sale.refund.cash_session_id}
          </small>
          <p>El pago y la venta originales se conservan.</p>
        </section>
      )}
      <footer className="receipt-footer">
        <strong>Documento interno. No es factura electrónica.</strong>
        <p>
          No acredita emisión ni validación DIAN. El cobro corresponde al efectivo declarado por el
          operador.
        </p>
        <small>Nexora POS · El futuro de tu restaurante.</small>
      </footer>
    </article>
  )
}
