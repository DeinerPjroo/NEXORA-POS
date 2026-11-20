import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { CheckoutPage } from '../sales/CheckoutPage'
import { SaleReceipt } from '../sales/SaleReceipt'
import type { Sale } from '../sales/types'
import './terminal-checkout.css'

export function TerminalCheckout({
  orderId,
  onClose,
}: {
  orderId: number
  onClose: (completed: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [locked, setLocked] = useState(false)
  const [sale, setSale] = useState<Sale | null>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  const close = () => {
    if (!locked) onClose(!!sale)
  }
  return (
    <dialog
      ref={dialog}
      className="terminal-checkout"
      aria-label="Cobro en terminal"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <header className="terminal-checkout-header">
        <div>
          <span className="eyebrow">NEXORA POS · CAJA</span>
          <h2>{sale ? `Recibo ${sale.receipt_code}` : `Cobrar pedido #${orderId}`}</h2>
        </div>
        <button type="button" className="button secondary" disabled={locked} onClick={close}>
          {sale ? <X size={18} /> : <ArrowLeft size={18} />}
          {sale ? 'Volver a terminal' : 'Volver al pedido'}
        </button>
      </header>
      <div className="terminal-checkout-body">
        {sale ? (
          <>
            <SaleReceipt sale={sale} />
            <button type="button" className="button primary" onClick={close}>
              Nueva operación POS
            </button>
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
    </dialog>
  )
}
