export type Theme = {
  primary: string
  secondary: string
  mode: 'light' | 'dark'
  radius: 'rounded' | 'soft'
}
export type Settings = { revision: number; theme: Theme }
export type Company = {
  id: number
  public_id: string
  name: string
  business_type: string
  currency: string
  timezone: string
  locale: string
}
export type Session = {
  security: ScreenSecurity
  user: { id: number; name: string; email: string; email_verified_at: string | null }
  company: Company
  role: { id: number; name: string; is_owner: boolean }
  permissions: string[]
  settings: Settings
}
export type ScreenSecurity = {
  locked: boolean
  challenge: string | null
  pin_enabled: boolean
  revision: number
}
export type Branch = {
  id: number
  name: string
  code: string
  address: string | null
  city: string | null
  phone: string | null
  is_active: boolean
}
export type Permission = { id: number; key: string; name: string; group: string }
export type Role = { id: number; name: string; is_owner: boolean; permissions: Permission[] }
export type Activity = { id: number; action: string; description: string; created_at: string }
export const businessTypes = [
  ['restaurant', 'Restaurante'],
  ['pizzeria', 'Pizzería'],
  ['cafe', 'Cafetería'],
  ['fast_food', 'Comidas rápidas'],
  ['bar', 'Bar'],
  ['bakery', 'Panadería'],
  ['other', 'Otro establecimiento'],
]
