import { formatMoney } from '../../lib/money'
import { comboModes } from '../catalog/combo-types'
import { taxSummary } from '../sales/tax-types'
import { ModifierDetails } from './ModifierDetails'
import type { CartLine } from './cart'

export function CartComboDetails({ line, currency }: { line: CartLine; currency: string }) {
  if (line.kind !== 'combo') return null
  return (
    <div className="combo-composition">
      {line.allocation_mode && <small className="muted">{comboModes[line.allocation_mode]}</small>}
      {line.components?.map((part, index) => (
        <div className="combo-component-line" key={`${part.component_id}:${part.unit_index}`}>
          <strong>
            {index + 1}. {part.product_name}
            {part.variant_name ? ` · ${part.variant_name}` : ''}
          </strong>
          <small>
            Parte por unidad de combo: {formatMoney(part.expected_unit_price, currency)}.
          </small>
          {part.tax_snapshot?.name && part.tax_snapshot.price_mode !== 'none' && (
            <small>
              Perfil: {part.tax_snapshot.name} ·{' '}
              {taxSummary({
                price_mode: part.tax_snapshot.price_mode,
                rates: part.tax_snapshot.rates,
              })}
              .
            </small>
          )}
          <ModifierDetails
            groups={part.modifier_labels}
            basePrice={part.base_unit_price}
            currency={currency}
          />
          {part.notes && <small>Preparación: {part.notes}</small>}
        </div>
      ))}
    </div>
  )
}
