import type { OrderChannel } from './context-price-types'

export type Promotion = {
  id: number
  product_id: number
  variant_id: number | null
  branch_id: number | null
  channel: 'all' | OrderChannel
  name: string
  discount_type: 'fixed' | 'percentage'
  discount_value: string
  priority: number
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  revision: number
  branch: { id: number; name: string; is_active: boolean } | null
}
export type PromotionSnapshot = Pick<
  Promotion,
  | 'id'
  | 'name'
  | 'revision'
  | 'discount_type'
  | 'discount_value'
  | 'priority'
  | 'valid_from'
  | 'valid_until'
> & {
  discount_amount: string
  scope_branch_id: number | null
  scope_channel: 'all' | OrderChannel
  timezone: string
  local_date: string
}
