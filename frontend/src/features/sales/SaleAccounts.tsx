import { formatMoney } from '../../lib/money'
import type { Sale } from './types'

export function SaleAccounts({ sale }: { sale: Sale }) {
  if (!sale.accounts.length) return null
  return (
    <section className="receipt-refund" aria-label="Cuentas de la venta">
      <h3>Cuenta dividida en {sale.accounts.length} partes</h3>
      <p>Una venta y un recibo. Los centavos sobrantes se asignan a las primeras partes.</p>
      {sale.accounts.map((account) => (
        <section className="sale-account-card" key={account.id} aria-label={account.label}>
          <h4>{account.label}</h4>
          <dl className="sale-amounts">
            <div>
              <dt>Importe original</dt>
              <dd>{formatMoney(account.amount, sale.currency)}</dd>
            </div>
            <div>
              <dt>Pagos aplicados</dt>
              <dd>{formatMoney(account.paid_amount, sale.currency)}</dd>
            </div>
            {account.refunded_amount !== '0.0000' && (
              <div>
                <dt>Devuelto</dt>
                <dd>{formatMoney(account.refunded_amount, sale.currency)}</dd>
              </div>
            )}
            {account.cancelled_balance !== '0.0000' && (
              <div>
                <dt>Saldo cancelado</dt>
                <dd>{formatMoney(account.cancelled_balance, sale.currency)}</dd>
              </div>
            )}
            <div>
              <dt>Saldo de la cuenta</dt>
              <dd>{formatMoney(account.balance_due, sale.currency)}</dd>
            </div>
          </dl>
        </section>
      ))}
    </section>
  )
}
