export const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export type AvailabilityWindow = {
  id: number
  product_id: number
  name: string
  weekday: number
  start_time: string
  end_time: string
  ends_next_day: boolean
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  revision: number
}
export type AvailabilityContext = {
  version: number
  enabled: boolean
  allowed: boolean
  reason: string | null
  timezone: string
  checked_at: string
  product_revision: number
  windows: (Omit<AvailabilityWindow, 'product_id' | 'is_active'> & { anchor_date: string })[]
}
