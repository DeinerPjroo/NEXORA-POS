import type { AvailabilityContext } from '../catalog/availability-types'

export function AvailabilityDetails({ context }: { context?: AvailabilityContext | null }) {
  if (!context?.enabled) return null
  const checked = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: context.timezone,
  }).format(new Date(context.checked_at))
  return (
    <small className="muted price-details">
      Horario comprobado al registrar: {checked} · {context.timezone} ·{' '}
      {context.windows.map((window) => window.name).join(', ')}.
    </small>
  )
}
