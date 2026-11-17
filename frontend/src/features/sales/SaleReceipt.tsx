import { formatMoney } from '../../lib/money'
import { useSession } from '../auth/SessionProvider'
import { SaleAmounts } from './SaleAmounts'
import { PaymentHistory } from './PaymentHistory'
import { saleStates } from './types'
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
          {saleStates[sale.status]}
        </span>
      </header>
      <div className="receipt-reference">
        <span>Pedido #{sale.order_id}</span>
        {sale.reference && <span>{sale.reference}</span>}
        <span>
          {sale.currency} ·{' '}
          {sale.payments.length > 1 ? 'Varios pagos' : (sale.payment?.method_name ?? 'Efectivo')}
        </span>
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
      <PaymentHistory sale={sale} />
      {!!sale.refunds.length && (
        <section className="receipt-refund">
          <h3>
            {sale.status === 'refunded'
              ? 'Devolución total registrada'
              : 'Devoluciones parciales registradas'}
          </h3>
          <strong>{formatMoney(sale.refunded_amount, sale.currency)}</strong>
          {sale.refunds.map((refund) => (
            <div key={refund.id}>
              <p>
                Pago #{refund.payment_id} ·{' '}
                {sale.payments.find((payment) => payment.id === refund.payment_id)?.method_name} ·{' '}
                {formatMoney(refund.amount, sale.currency)}
              </p>
              <p>{refund.reason}</p>
              {refund.reference && <p>Referencia: {refund.reference}</p>}
              <small>
                {date(refund.created_at)} · Sesión de caja #{refund.cash_session_id}
              </small>
            </div>
          ))}
          {sale.cancelled_balance !== '0.0000' && (
            <p>Saldo no cobrado cancelado: {formatMoney(sale.cancelled_balance, sale.currency)}</p>
          )}
          <dl className="sale-amounts">
            <div>
              <dt>Importe neto de la venta</dt>
              <dd>{formatMoney(sale.effective_total, sale.currency)}</dd>
            </div>
            <div>
              <dt>Pagos netos tras devoluciones</dt>
              <dd>{formatMoney(sale.net_paid_amount, sale.currency)}</dd>
            </div>
          </dl>
          <p>El pago y la venta originales se conservan.</p>
        </section>
      )}
      <footer className="receipt-footer">
        <strong>Documento interno. No es factura electrónica.</strong>
        <p>
          No acredita emisión ni validación DIAN. El pago fue registrado manualmente por el
          operador.
        </p>
        <small>Nexora POS · El futuro de tu restaurante.</small>
      </footer>
    </article>
  )
}
