import { formatMoney } from '../../lib/money'
import { comboModes } from '../catalog/combo-types'
import type { OrderCombo, OrderItem } from '../operations/types'
import { PriceDetails } from './PriceDetails'
import { AvailabilityDetails } from './AvailabilityDetails'
import { ModifierDetails } from './ModifierDetails'

export function SavedCombos({
  combos = [],
  items = [],
  currency,
}: {
  combos?: OrderCombo[]
  items?: OrderItem[]
  currency: string
}) {
  return (
    <>
      {combos.map((combo) => (
        <section className="saved-combo" key={combo.id}>
          <div className="panel-heading">
            <strong>
              {combo.quantity}× {combo.product_name}
            </strong>
            <b>{formatMoney(combo.line_subtotal, currency)}</b>
          </div>
          <small>
            {combo.sku} · {formatMoney(combo.unit_price, currency)} por combo ·{' '}
            {comboModes[combo.snapshot.allocation_mode]}
          </small>
          {combo.notes && <p>{combo.notes}</p>}
          <PriceDetails context={combo.snapshot.price_context} currency={currency} />
          <AvailabilityDetails context={combo.snapshot.availability_context} />
          <p className="muted small">Partes asignadas del precio del combo:</p>
          {items
            .filter((item) => item.order_combo_id === combo.id)
            .sort((a, b) => (a.combo_position ?? 0) - (b.combo_position ?? 0))
            .map((item) => (
              <div className="combo-component-line" key={item.id}>
                <strong>
                  {item.quantity}× {item.product_name}
                  {item.variant_name ? ` · ${item.variant_name}` : ''}
                </strong>
                <small>
                  {formatMoney(item.unit_price, currency)} por unidad · Parte total:{' '}
                  {formatMoney(item.line_subtotal, currency)}.
                </small>
                <PriceDetails context={item.price_snapshot} currency={currency} />
                <ModifierDetails
                  groups={item.modifiers_snapshot}
                  basePrice={item.base_unit_price}
                  currency={currency}
                />
                {item.notes && <p>{item.notes}</p>}
              </div>
            ))}
        </section>
      ))}
    </>
  )
}
