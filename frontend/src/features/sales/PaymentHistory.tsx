import { formatMoney } from '../../lib/money'
import { useSession } from '../auth/SessionProvider'
import type { Sale } from './types'

export function PaymentHistory({ sale }: { sale: Sale }) {
  const { session } = useSession()
  const date = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: session!.company.timezone,
    }).format(new Date(value))
  return (
    <>
      <dl className="sale-amounts receipt-cash">
        <div>
          <dt>Pagos aplicados a la venta</dt>
          <dd>{formatMoney(sale.paid_amount, sale.currency)}</dd>
        </div>
        <div className="sale-grand-total">
          <dt>Saldo pendiente</dt>
          <dd>{formatMoney(sale.balance_due, sale.currency)}</dd>
        </div>
      </dl>
      {sale.payments.map((payment) =>
        payment.method_kind === 'cash' ? (
          <section className="receipt-refund" key={payment.id}>
            <h3>Pago en efectivo · {payment.method_name}</h3>
            {payment.account_id && (
              <p>
                {sale.accounts.find((account) => account.id === payment.account_id)?.label} · Pago #
                {payment.id}
              </p>
            )}
            <dl className="sale-amounts">
              <div>
                <dt>Importe del pago</dt>
                <dd>{formatMoney(payment.amount, sale.currency)}</dd>
              </div>
              <div>
                <dt>Efectivo recibido</dt>
                <dd>{formatMoney(payment.received_amount, sale.currency)}</dd>
              </div>
              <div>
                <dt>Cambio entregado</dt>
                <dd>{formatMoney(payment.change_amount, sale.currency)}</dd>
              </div>
              <div>
                <dt>Ingreso neto en caja</dt>
                <dd>{formatMoney(payment.amount, sale.currency)}</dd>
              </div>
            </dl>
            <small>
              {date(payment.created_at)} · Sesión #{payment.cash_session_id} · Registro del operador
            </small>
          </section>
        ) : (
          <section className="receipt-refund" key={payment.id}>
            <h3>Pago manual no efectivo</h3>
            {payment.account_id && (
              <p>
                {sale.accounts.find((account) => account.id === payment.account_id)?.label} · Pago #
                {payment.id}
              </p>
            )}
            <p>
              {payment.method_name} · {payment.reference}
            </p>
            <strong>{formatMoney(payment.amount, sale.currency)}</strong>
            <p className="small muted">
              {date(payment.created_at)} · Sesión #{payment.cash_session_id}
            </p>
            <p>
              Declarado por el operador. Sin confirmación de banco o pasarela. No modifica el
              efectivo de caja.
            </p>
          </section>
        ),
      )}
    </>
  )
}
