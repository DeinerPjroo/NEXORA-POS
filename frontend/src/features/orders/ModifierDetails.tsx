import { formatMoney, moneyUnits } from '../../lib/money'
import type { ModifierSnapshot } from '../catalog/modifier-types'

export function ModifierDetails({
  groups,
  currency,
  basePrice,
}: {
  groups?: ModifierSnapshot[] | null
  currency: string
  basePrice?: string | null
}) {
  if (!groups?.length) return null
  return (
    <div className="modifier-details">
      {basePrice && <small>Base por unidad: {formatMoney(basePrice, currency)}</small>}
      {groups.map((group) => (
        <small key={group.group_id}>
          <strong>{group.group_name}:</strong>{' '}
          {group.options
            .map(
              (option) =>
                `${option.name}${moneyUnits(option.extra_price) > 0n ? ` (+ ${formatMoney(option.extra_price, currency)})` : ''}`,
            )
            .join(', ')}
        </small>
      ))}
    </div>
  )
}
