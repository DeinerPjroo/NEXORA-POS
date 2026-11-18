import { Modal } from '../../components/ui'
import { formatMoney } from '../../lib/money'
import { channelLabels } from '../catalog/context-price-types'
import { cartSubtotal } from './cart'
import { ModifierDetails } from './ModifierDetails'
import { CartComboDetails } from './CartComboDetails'
import { taxSummary } from '../sales/tax-types'
import type { CartReview } from './useCartPricing'

export function PriceReviewModal({
  review,
  currency,
  onApply,
  onCancel,
}: {
  review: CartReview
  currency: string
  onApply: () => void
  onCancel: () => void
}) {
  return (
    <Modal title="Revisar precios del pedido" onClose={onCancel}>
      <div className="form-stack">
        <p>
          Precios actuales para <strong>{review.preview.branch_name}</strong> ·{' '}
          {channelLabels[review.target.channel]}. Conservaremos cantidades y observaciones.
        </p>
        {review.after.map((line, index) => (
          <section className="cart-line" key={line.key}>
            <strong>
              {line.quantity} × {line.product_name}
              {line.variant_name ? ` · ${line.variant_name}` : ''}
            </strong>
            <p>
              Antes por unidad: {formatMoney(review.before[index].expected_unit_price, currency)}.
              Ahora: {formatMoney(line.expected_unit_price, currency)}.
            </p>
            {line.product_name !== review.before[index].product_name && (
              <p className="muted small">Nombre anterior: {review.before[index].product_name}</p>
            )}
            <div className="form-grid">
              <div>
                <small>Opciones anteriores</small>
                <CartComboDetails line={review.before[index]} currency={currency} />
                <ModifierDetails
                  groups={review.before[index].modifier_labels}
                  currency={currency}
                />
              </div>
              <div>
                <small>Opciones actuales</small>
                <CartComboDetails line={line} currency={currency} />
                <ModifierDetails groups={line.modifier_labels} currency={currency} />
              </div>
            </div>
            {JSON.stringify(line.tax_snapshot) !==
              JSON.stringify(review.before[index].tax_snapshot) && (
              <p className="notice">
                Perfil tributario actual:{' '}
                {line.tax_snapshot?.name
                  ? `${line.tax_snapshot.name} · ${taxSummary({ price_mode: line.tax_snapshot.price_mode === 'inclusive' ? 'inclusive' : 'exclusive', rates: line.tax_snapshot.rates })}`
                  : 'Sin perfil asignado'}
                .
              </p>
            )}
            {line.notes && <p className="muted small">Observación: {line.notes}</p>}
          </section>
        ))}
        <p>
          Subtotal anterior: {formatMoney(cartSubtotal(review.before), currency)}. Nuevo subtotal:{' '}
          <strong>{formatMoney(cartSubtotal(review.after), currency)}</strong>.
        </p>
        <div className="form-actions price-review-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            Conservar contexto anterior
          </button>
          <button type="button" className="button primary" onClick={onApply}>
            Aplicar precios revisados
          </button>
        </div>
      </div>
    </Modal>
  )
}
