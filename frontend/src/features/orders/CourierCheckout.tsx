import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { CashTenderKeypad } from '../pos/CashTenderKeypad'
import { ChangeDueDisplay } from '../pos/ChangeDueDisplay'
import { SaleAmounts } from '../sales/SaleAmounts'
import { SalePrintButton } from '../sales/SalePrintButton'
import type { Sale, SaleQuote } from '../sales/types'
import type { Order } from '../operations/types'
import type { Delivery } from './delivery-types'
import '../pos/terminal-checkout.css'
import './courier-checkout.css'

export function CourierCheckout({
  delivery,
  order,
  onClose,
}: {
  delivery: Delivery
  order: Order
  onClose: () => void
}) {
  const client = useQueryClient()
  const [received, setReceived] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [sale, setSale] = useState<Sale | null>(null)
  const quote = useQuery({
    queryKey: ['courier-quote', order.id, delivery.revision],
    queryFn: () => api<{ data: SaleQuote }>(`orders/${order.id}/quote?discount_amount=0`),
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: Infinity,
  })
  const operation = useOperation<Sale>(
    `deliveries/${delivery.id}/collect-courier`,
    async (result) => {
      setSale(result)
      await Promise.all(
        ['deliveries', 'order', 'orders', 'sales', 'courier-collections'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
    },
  )
  const value = received.replace(',', '.')
  const total = quote.data?.data.total
  const difference =
    total && /^\d{1,15}(?:\.\d{1,2})?$/.test(value) ? moneyUnits(value) - moneyUnits(total) : null
  const change = difference !== null && difference >= 0n ? unitsToMoney(difference) : null
  return (
    <section className="terminal-checkout" aria-label="Cobro en efectivo con repartidor">
      <header className="terminal-checkout-header">
        <h2>
          {sale
            ? `Recibo ${sale.receipt_code}`
            : `Efectivo recibido por ${delivery.courier_name ?? 'repartidor'}`}
        </h2>
        <button disabled={operation.locked} onClick={onClose}>
          Volver a domicilios
        </button>
      </header>
      {sale ? (
        <div className="terminal-checkout-body">
          <strong>Pago registrado · {formatMoney(sale.total, sale.currency)}</strong>
          <p>El efectivo está en custodia del repartidor. Todavía no ingresó a caja.</p>
          <ChangeDueDisplay
            amount={sale.payments[0]?.change_amount ?? null}
            currency={sale.currency}
          />
          <SaleAmounts amounts={sale} />
          <SalePrintButton sale={sale} />
        </div>
      ) : (
        <div className="courier-checkout-grid">
          <section className="panel courier-checkout-summary">
            <h3>
              Pedido #{order.id} · {delivery.recipient_name}
            </h3>
            <table aria-label="Cuenta del domicilio">
              <tbody>
                {order.items?.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.quantity} × {item.product_name}
                    </td>
                    <td>{formatMoney(item.line_subtotal, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {quote.isPending && <Loading />}
            {quote.data && <SaleAmounts amounts={quote.data.data} />}
            <p>
              Cobro completo en efectivo, sin ajustes ni división. El pago no confirma la entrega
              del domicilio.
            </p>
          </section>
          <section className="panel courier-checkout-controls">
            <div className="courier-checkout-fields">
              <ErrorNotice error={quote.error || operation.error} />
              <OperationNotice uncertain={operation.uncertain} />
              <fieldset disabled={operation.locked} className="form-stack">
                <Field label="Efectivo recibido por el repartidor">
                  <input
                    inputMode="decimal"
                    value={received}
                    onChange={(event) => {
                      setReceived(event.target.value)
                      setConfirmed(false)
                    }}
                  />
                </Field>
                <Field label="Observación del cobro">
                  <textarea
                    value={reason}
                    maxLength={250}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Confirmo que el repartidor recibió el efectivo y devolvió el cambio
                </label>
              </fieldset>
            </div>
            <div className="courier-tender-dock">
              <strong>Total: {total ? formatMoney(total, order.currency) : '—'}</strong>
              <ChangeDueDisplay amount={change} currency={order.currency} />
              <fieldset disabled={operation.locked}>
                <CashTenderKeypad
                  value={received}
                  onChange={(next) => {
                    setReceived(next)
                    setConfirmed(false)
                  }}
                />
              </fieldset>
              <button
                className="button primary"
                disabled={
                  operation.isPending ||
                  (!operation.uncertain &&
                    (!confirmed ||
                      change === null ||
                      reason.trim().length < 3 ||
                      !quote.data ||
                      quote.isFetching))
                }
                onClick={() =>
                  operation.send({
                    delivery_revision: delivery.revision,
                    order_revision: quote.data?.data.order_revision,
                    settings_revision: quote.data?.data.settings_revision,
                    expected_total: total?.replace(/(\.\d{2})00$/, '$1'),
                    received_amount: value,
                    confirmed_received: confirmed,
                    reason: reason.trim(),
                  })
                }
              >
                {operation.uncertain ? 'Reintentar mismo cobro' : 'Confirmar cobro en custodia'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
