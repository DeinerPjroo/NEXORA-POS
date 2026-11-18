import type { Product, Variant } from './types'
import type { PriceContext } from './context-price-types'
export type ComboComponent = {
  id: number
  product_id: number
  combo_group_id: number | null
  component_product_id: number
  component_variant_id: number | null
  units: number
  position: number
  revision: number
  is_active: boolean
  product?: Product
  variant?: Variant | null
  selection_context?: { allowed: boolean; reason: string | null }
}
export type ComboGroup = {
  id: number
  product_id: number
  name: string
  min_select: number
  max_select: number
  position: number
  revision: number
  is_active: boolean
}
export type ComboGroupSnapshot = Pick<
  ComboGroup,
  'id' | 'name' | 'revision' | 'min_select' | 'max_select' | 'position'
> & { selected_component_ids: number[] }
export type ComboMode = 'equal' | 'proportional'
export const comboModes = {
  equal: 'Igual por unidad de componente',
  proportional: 'Proporcional a precios base de referencia',
}
export type ComboConfiguration = {
  data: ComboComponent[]
  groups: ComboGroup[]
  selection_version: 1 | 2
  product_revision: number
  allocation_mode: ComboMode | null
  price_context: PriceContext
  combo_context: { ready: boolean; reason: string | null; expanded_units: number }
}
