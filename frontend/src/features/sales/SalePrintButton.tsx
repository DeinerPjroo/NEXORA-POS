import { useState } from 'react'
import { Printer } from 'lucide-react'
import { PrintDocumentPreview } from '../../components/PrintDocumentPreview'
import { useSession } from '../auth/SessionProvider'
import { formatMoney, moneyUnits } from '../../lib/money'
import { SaleAmounts } from './SaleAmounts'
import { saleStates, type Sale } from './types'

export function SalePrintButton({ sale, disabled = false }: { sale: Sale; disabled?: boolean }) {
  const [copy, setCopy] = useState<Sale | null>(null)
  return (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={disabled}
        onClick={() => setCopy(structuredClone(sale))}
      >
        <Printer size={16} />
        Imprimir recibo
      </button>
      {copy && (
        <PrintDocumentPreview
          title={`Imprimir recibo ${copy.receipt_code}`}
          onClose={() => setCopy(null)}
        >
          {(width) => <ThermalSaleReceipt sale={copy} width={width} />}
        </PrintDocumentPreview>
      )}
    </>
  )
}

function ThermalSaleReceipt({ sale, width }: { sale: Sale; width: string }) {
  const { session } = useSession()
  if (!session) return null
  const money = (amount: string) => formatMoney(amount, sale.currency)
  const date = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: session.company.timezone,
    }).format(new Date(value))
  const positive = (amount: string) => moneyUnits(amount) > 0n
  return (
    <article
      className="operational-ticket thermal-sale-receipt"
      data-width={width}
      aria-label={`Recibo imprimible ${sale.receipt_code}`}
    >
      <h1>{sale.business_name}</h1>
      <h2>RECIBO DE VENTA · {sale.receipt_code}</h2>
      <p>{sale.branch_name}</p>
      {sale.branch_address && <p>{sale.branch_address}</p>}
      <p>
        {date(sale.created_at)} · {sale.currency}
      </p>
      <p>Pedido #{sale.order_id}</p>
      {sale.channel && (
        <p>
          {
            {
              dine_in: 'Consumo en mesa',
              takeaway: 'Para llevar · Recogida',
              delivery: 'Domicilio',
            }[sale.channel]
          }
        </p>
      )}
      {sale.dining_snapshot?.tables.length ? (
        <p>
          Mesas al registrar: {sale.dining_snapshot.tables.map((table) => table.name).join(', ')}
        </p>
      ) : null}
      {sale.customer_name && <p>Cliente: {sale.customer_name}</p>}
      {sale.reference && <p>Referencia: {sale.reference}</p>}
      <h2>
        {saleStates[sale.status]}
        {positive(sale.balance_due) ? ' · SALDO PENDIENTE' : ''}
      </h2>
      {(sale.items ?? []).map((item) => (
        <section className="ticket-line" key={item.id}>
          {item.order_combo_id && (
            <p>
              Combo:{' '}
              {sale.combos?.find((combo) => combo.id === item.order_combo_id)?.product_name ??
                `#${item.order_combo_id}`}
            </p>
          )}
          <div>
            <strong>
              {item.quantity} × {item.product_name}
              {item.variant_name ? ` · ${item.variant_name}` : ''}
            </strong>
            <span>{money(item.line_subtotal)}</span>
          </div>
          <p>{money(item.unit_price)} c/u</p>
          {item.modifiers_snapshot?.flatMap((group) =>
            group.options.map((option) => (
              <p key={`${group.group_id}:${option.id}`}>
                {group.group_name}: {option.name}
              </p>
            )),
          )}
        </section>
      ))}
      <SaleAmounts amounts={sale} />
      {sale.discount_reason && <p>Motivo del descuento: {sale.discount_reason}</p>}
      {positive(sale.tip_amount) && <p>Propina voluntaria aceptada.</p>}
      <section className="ticket-line">
        <h2>Pagos registrados</h2>
        {sale.payments.map((payment) => (
          <div className="thermal-payment" key={payment.id}>
            <strong>
              {payment.method_name}: {money(payment.amount)}
            </strong>
            {payment.account_id && (
              <p>
                {sale.accounts.find((account) => account.id === payment.account_id)?.label ??
                  `Cuenta #${payment.account_id}`}
              </p>
            )}
            {payment.method_kind === 'cash' ? (
              <>
                <p>Recibido: {money(payment.received_amount)}</p>
                <p>Cambio: {money(payment.change_amount)}</p>
              </>
            ) : (
              <>
                <p>Referencia: {payment.reference}</p>
                <p>Registro manual, sin confirmación bancaria.</p>
              </>
            )}
          </div>
        ))}
        <p>
          Pagos aplicados: <strong>{money(sale.paid_amount)}</strong>
        </p>
        <p>
          Saldo pendiente: <strong>{money(sale.balance_due)}</strong>
        </p>
      </section>
      {(positive(sale.refunded_amount) || sale.status === 'refunded') && (
        <section className="ticket-line">
          <h2>Devoluciones</h2>
          {sale.refunds.map((refund) => (
            <p key={refund.id}>
              {date(refund.created_at)} · {money(refund.amount)} · {refund.reason}
            </p>
          ))}
          <p>Devuelto: {money(sale.refunded_amount)}</p>
          <p>Pagos netos: {money(sale.net_paid_amount)}</p>
          {positive(sale.cancelled_balance) && (
            <p>Saldo no cobrado cancelado: {money(sale.cancelled_balance)}</p>
          )}
        </section>
      )}
      <footer>
        <strong>Documento interno. No es factura electrónica.</strong>
        <p>Pago registrado por el operador. Conserve este recibo.</p>
        <p>Nexora POS · El futuro de tu restaurante.</p>
      </footer>
    </article>
  )
}
