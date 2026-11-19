import type { PriceContext } from '../catalog/context-price-types'
import { channelLabels } from '../catalog/context-price-types'
import { formatMoney } from '../../lib/money'

export function PriceDetails({
  context,
  currency,
}: {
  context?: PriceContext | null
  currency: string
}) {
  if (!context) return null
  if (context.usage === 'combo_reference')
    return (
      <small className="muted price-details">
        Referencia conservada: {formatMoney(context.amount, currency)} · Base asignada al
        componente: {formatMoney(context.allocated_amount ?? '0', currency)} · {context.branch_name}{' '}
        · {channelLabels[context.channel]}.
      </small>
    )
  return (
    <small className="muted price-details">
      {context.promotion && (
        <span>
          Promoción conservada: {context.promotion.name} · Base anterior{' '}
          {formatMoney(context.base_amount ?? context.amount, currency)} · Descuento de base{' '}
          {formatMoney(context.promotion.discount_amount, currency)}.{' '}
        </span>
      )}
      {context.source === 'rule' ? 'Precio por sucursal/canal' : 'Precio base'} conservado:{' '}
      {formatMoney(context.amount, currency)} · {context.branch_name} ·{' '}
      {channelLabels[context.channel]}.
    </small>
  )
}
