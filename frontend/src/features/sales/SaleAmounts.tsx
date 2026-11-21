import { formatMoney } from '../../lib/money'
import type { SaleQuote } from './types'

export function SaleAmounts({
  amounts,
}: {
  amounts: Omit<SaleQuote, 'order_revision' | 'accounts_preview'>
}) {
  const money = (value: string) => formatMoney(value, amounts.currency)
  const goodsBase = amounts.delivery_charge?.goods_taxable_base ?? amounts.taxable_base
  const goodsTax = amounts.delivery_charge?.goods_tax_amount ?? amounts.tax_amount
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
        <dt>
          Descuento
          {amounts.discount_type === 'percentage'
            ? ` (${amounts.discount_value.replace(/\.?0+$/, '') || '0'} %)`
            : ''}
        </dt>
        <dd>{money(amounts.discount_amount)}</dd>
      </div>
      {amounts.tax_mode === 'product' && amounts.tax_breakdown ? (
        <>
          <div>
            <dt>Base de productos y propina participante</dt>
            <dd>{money(goodsBase)}</dd>
          </div>
          <div>
            <dt>Impuestos incluidos en precios</dt>
            <dd>{money(amounts.tax_breakdown.included_tax_amount)}</dd>
          </div>
          <div>
            <dt>Impuestos adicionales por producto</dt>
            <dd>{money(amounts.tax_breakdown.additional_tax_amount)}</dd>
          </div>
        </>
      ) : amounts.tax_mode !== 'none' ? (
        <>
          <div>
            <dt>
              {amounts.tax_mode === 'inclusive'
                ? 'Base extraída del precio'
                : 'Base del impuesto adicional'}
            </dt>
            <dd>{money(goodsBase)}</dd>
          </div>
          <div>
            <dt>
              {amounts.tax_name} ({amounts.tax_rate.replace(/\.?0+$/, '') || '0'} %
              {amounts.tax_mode === 'inclusive' ? ' incluido' : ''})
            </dt>
            <dd>{money(goodsTax)}</dd>
          </div>
        </>
      ) : (
        <div>
          <dt>Impuesto adicional calculado</dt>
          <dd>{money('0')}</dd>
        </div>
      )}
      {amounts.delivery_charge && (
        <>
          <div>
            <dt>
              Domicilio
              {amounts.delivery_charge.zone_name ? ` · ${amounts.delivery_charge.zone_name}` : ''}
            </dt>
            <dd>{money(amounts.delivery_charge.amount)}</dd>
          </div>
          {amounts.delivery_charge.additional_tax_amount !== '0.0000' && (
            <div>
              <dt>Impuestos adicionales del domicilio</dt>
              <dd>{money(amounts.delivery_charge.additional_tax_amount)}</dd>
            </div>
          )}
          {amounts.delivery_charge.included_tax_amount !== '0.0000' && (
            <div>
              <dt>Impuestos ya incluidos en domicilio</dt>
              <dd>{money(amounts.delivery_charge.included_tax_amount)}</dd>
            </div>
          )}
        </>
      )}
      {amounts.tip_amount !== '0.0000' && (
        <div>
          <dt>
            Propina voluntaria
            {amounts.tip_tax_mode === 'included' ? ' · Incluida en la base' : ' · Fuera de la base'}
          </dt>
          <dd>{money(amounts.tip_amount)}</dd>
        </div>
      )}
      <div className="sale-grand-total">
        <dt>Total</dt>
        <dd>{money(amounts.total)}</dd>
      </div>
    </dl>
  )
}
