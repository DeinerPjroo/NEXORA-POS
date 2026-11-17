import { formatMoney } from '../../lib/money'
import type { TaxBreakdown, TaxLine } from './tax-types'

export function TaxBreakdownDetails({
  breakdown,
  currency,
}: {
  breakdown: TaxBreakdown | null
  currency: string
}) {
  if (!breakdown) return null
  return (
    <section className="receipt-refund" aria-label="Desglose de impuestos">
      <h3>Impuestos por producto</h3>
      {breakdown.items.map((line) => (
        <section className="sale-account-card" key={line.order_item_id}>
          <h4>
            {line.product_name}
            {line.variant_name ? ` · ${line.variant_name}` : ''}
          </h4>
          <p>
            Subtotal asignado {formatMoney(line.subtotal, currency)} · Descuento{' '}
            {formatMoney(line.discount_amount, currency)}
          </p>
          <TaxLineDetails line={line} currency={currency} />
        </section>
      ))}
      {breakdown.tip && (
        <section className="sale-account-card">
          <h4>Propina voluntaria</h4>
          <TaxLineDetails line={breakdown.tip} currency={currency} />
        </section>
      )}
      <p className="small muted">
        Los centavos de subtotal y descuento se distribuyen por proporción y mayores restos. Los
        impuestos incluidos ya forman parte del precio final.
      </p>
    </section>
  )
}

function TaxLineDetails({ line, currency }: { line: TaxLine; currency: string }) {
  return (
    <>
      <p>
        {line.profile.name ?? 'Sin perfil de impuestos'} ·{' '}
        {line.profile.price_mode === 'inclusive'
          ? 'Incluidos en el precio'
          : line.profile.price_mode === 'exclusive'
            ? 'Adicionales al precio'
            : 'Sin cálculo por producto'}
      </p>
      <dl className="sale-amounts">
        <div>
          <dt>Base</dt>
          <dd>{formatMoney(line.base, currency)}</dd>
        </div>
        {line.taxes.map((tax, index) => (
          <div key={index}>
            <dt>
              {tax.name} ({tax.rate.replace(/\.?0+$/, '') || '0'} %)
            </dt>
            <dd>{formatMoney(tax.amount, currency)}</dd>
          </div>
        ))}
        <div>
          <dt>Importe final</dt>
          <dd>{formatMoney(line.total, currency)}</dd>
        </div>
      </dl>
    </>
  )
}
