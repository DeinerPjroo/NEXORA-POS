import type { Product, Variant } from './types'
import type { PriceContext } from './context-price-types'
export type ComboComponent = {
  id: number
  product_id: number
  component_product_id: number
  component_variant_id: number | null
  units: number
  position: number
  revision: number
  is_active: boolean
  product?: Product
  variant?: Variant | null
}
export type ComboMode = 'equal' | 'proportional'
export const comboModes = {
  equal: 'Igual por unidad de componente',
  proportional: 'Proporcional a precios base de referencia',
}
export type ComboConfiguration = {
  data: ComboComponent[]
  product_revision: number
  allocation_mode: ComboMode | null
  price_context: PriceContext
  combo_context: { ready: boolean; reason: string | null; expanded_units: number }
}
