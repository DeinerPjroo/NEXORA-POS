import { formatMoney } from '../../lib/money'

export function ChangeDueDisplay({
  amount,
  currency,
  prepared = false,
}: {
  amount: string | null
  currency: string
  prepared?: boolean
}) {
  return (
    <section
      className="digital-change-due"
      role="region"
      aria-label="Cambio a devolver"
      aria-live="polite"
    >
      <span>CAMBIO A DEVOLVER</span>
      <strong>{amount === null ? '—' : formatMoney(amount, currency)}</strong>
      <small>
        {amount === null
          ? 'Revisa el efectivo recibido'
          : prepared
            ? 'Incluye los pagos preparados en efectivo'
            : 'Para entregar al cliente'}
      </small>
    </section>
  )
}
