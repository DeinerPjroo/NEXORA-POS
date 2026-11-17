import { formatMoney } from '../../lib/money'
import type { SaleQuote } from './types'

export function SaleAmounts({ amounts }: { amounts: Omit<SaleQuote, 'order_revision'> }) {
  const money = (value: string) => formatMoney(value, amounts.currency)
  return (
    <dl className="sale-amounts">
      <div>
        <dt>Subtotal del catálogo</dt>
        <dd>{money(amounts.catalog_subtotal)}</dd>
      </div>
      {amounts.rounding_adjustment !== '0.0000' && (
        <div>
          <dt>Ajuste a dos decimales</dt>
          <dd>{money(amounts.rounding_adjustment)}</dd>
        </div>
      )}
      <div>
        <dt>Subtotal redondeado</dt>
        <dd>{money(amounts.subtotal)}</dd>
      </div>
      <div>
        <dt>Descuento</dt>
        <dd>{money(amounts.discount_amount)}</dd>
      </div>
      {amounts.tax_mode === 'exclusive' ? (
        <>
          <div>
            <dt>Base después del descuento</dt>
            <dd>{money(amounts.taxable_base)}</dd>
          </div>
          <div>
            <dt>
              {amounts.tax_name} ({amounts.tax_rate.replace(/\.?0+$/, '') || '0'} %)
            </dt>
            <dd>{money(amounts.tax_amount)}</dd>
          </div>
        </>
      ) : (
        <div>
          <dt>Impuesto adicional calculado</dt>
          <dd>{money('0')}</dd>
        </div>
      )}
      <div className="sale-grand-total">
        <dt>Total</dt>
        <dd>{money(amounts.total)}</dd>
      </div>
    </dl>
  )
}
