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
  return (
    <small className="muted price-details">
      {context.source === 'rule' ? 'Precio por sucursal/canal' : 'Precio base'} conservado:{' '}
      {formatMoney(context.amount, currency)} · {context.branch_name} ·{' '}
      {channelLabels[context.channel]}.
    </small>
  )
}
