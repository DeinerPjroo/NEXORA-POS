export type ModifierOption = {
  id: number
  product_id: number
  modifier_group_id: number
  name: string
  extra_price: string
  is_active: boolean
  position: number
}
export type ModifierGroup = {
  id: number
  product_id: number
  name: string
  kind: 'addon' | 'exclusion'
  min_select: number
  max_select: number
  is_active: boolean
  position: number
  revision: number
  options_count?: number
  active_options_count?: number
  options?: ModifierOption[]
}
export type ModifierSelection = { group_id: number; option_ids: number[] }
export type ModifierSnapshot = {
  group_id: number
  group_name: string
  kind: 'addon' | 'exclusion'
  group_revision: number
  options: { id: number; name: string; extra_price: string }[]
}
