import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { CheckoutPage } from '../sales/CheckoutPage'
import { SaleReceipt } from '../sales/SaleReceipt'
import { SalePrintButton } from '../sales/SalePrintButton'
import { AddPaymentsModal } from '../sales/AddPaymentsModal'
import { moneyUnits, formatMoney } from '../../lib/money'
import type { Sale } from '../sales/types'
import './terminal-checkout.css'

export function TerminalCheckout({
  orderId,
  onClose,
}: {
  orderId: number
  onClose: (completed: boolean) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [locked, setLocked] = useState(false)
  const [sale, setSale] = useState<Sale | null>(null)
  const [accountId, setAccountId] = useState<number | undefined>()
  const pending = !!sale && moneyUnits(sale.balance_due) > 0n && sale.status !== 'refunded'
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const close = () => {
    if (!locked) onClose(!!sale && !pending)
  }
  return (
    <section
      className="terminal-checkout"
      aria-label="Cobro en terminal"
      data-pos-slot="checkout"
      onKeyDown={(event) => {
        if (!locked || event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]',
          ),
        ).filter((node) => node.getClientRects().length > 0)
        const target = event.shiftKey ? controls.at(-1) : controls[0]
        const edge = event.shiftKey ? controls[0] : controls.at(-1)
        if (
          !controls.includes(document.activeElement as HTMLElement) ||
          document.activeElement === edge
        ) {
          event.preventDefault()
          target?.focus()
        }
      }}
    >
      <header className="terminal-checkout-header">
        <div>
          <span className="eyebrow">NEXORA POS · CAJA</span>
          <h2 ref={heading} tabIndex={-1}>
            {sale && !pending ? `Recibo ${sale.receipt_code}` : `Cobrar pedido #${orderId}`}
          </h2>
        </div>
        <button type="button" className="button secondary" disabled={locked} onClick={close}>
          {sale ? <X size={18} /> : <ArrowLeft size={18} />}
          {sale && !pending ? 'Volver a terminal' : 'Volver al pedido'}
        </button>
      </header>
      <div className="terminal-checkout-body">
        {sale ? (
          <>
            {pending && (
              <div className="pending-checkout-grid">
                <aside className="panel pending-account-summary pos-payment-account">
                  <div className="pending-account-heading">
                    <strong>
                      {sale.channel === 'dine_in' ? 'Cuenta de la mesa' : 'Cuenta del pedido'}
                    </strong>
                    <small>{sale.customer_name || sale.reference || sale.receipt_code}</small>
                  </div>
                  <fieldset
                    disabled={locked}
                    className="pos-split-parts"
                    aria-label="Cuentas pendientes"
                  >
                    {sale.accounts.map((account) => (
                      <button
                        type="button"
                        key={account.id}
                        disabled={moneyUnits(account.balance_due) === 0n}
                        aria-pressed={
                          account.id ===
                          (accountId ??
                            sale.accounts.find((item) => moneyUnits(item.balance_due) > 0n)?.id)
                        }
                        onClick={() => setAccountId(account.id)}
                      >
                        {account.label} ·{' '}
                        {moneyUnits(account.balance_due) === 0n
                          ? 'Pagada'
                          : formatMoney(account.balance_due, sale.currency)}
                      </button>
                    ))}
                  </fieldset>
                  <div className="digital-checkout-lines">
                    <table aria-label="Productos de la cuenta pendiente">
                      <thead>
                        <tr>
                          <th>Cant.</th>
                          <th>Producto</th>
                          <th>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items?.map((item) => (
                          <tr key={item.id}>
                            <td>{item.quantity}</td>
                            <td>{item.product_name}</td>
                            <td>{formatMoney(item.line_subtotal, sale.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <SalePrintButton sale={sale} disabled={locked} />
                </aside>
                <AddPaymentsModal
                  key={`${sale.revision}:${accountId ?? ''}`}
                  embedded
                  initialAccountId={accountId}
                  sale={sale}
                  onLockChange={setLocked}
                  onClose={close}
                  onPaid={(updated) => {
                    setSale(updated)
                    setAccountId(undefined)
                    setLocked(false)
                  }}
                />
              </div>
            )}
            {!pending && <SalePrintButton sale={sale} disabled={locked} />}
            {!pending && <SaleReceipt sale={sale} />}
            {!pending && (
              <button type="button" className="button primary" onClick={close}>
                Nueva operación POS
              </button>
            )}
          </>
        ) : (
          <CheckoutPage
            terminal
            orderId={orderId}
            onLockChange={setLocked}
            onCollected={(result) => {
              setSale(result)
              setLocked(false)
            }}
          />
        )}
      </div>
    </section>
  )
}
