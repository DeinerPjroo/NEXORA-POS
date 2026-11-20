export type OrderChannel = 'takeaway' | 'dine_in' | 'delivery'
export const channelLabels = {
  all: 'Todos los canales',
  takeaway: 'Para llevar / Recogida',
  dine_in: 'Consumo en mesa',
  delivery: 'Domicilio',
}
export type PriceContext = {
  usage?: 'combo_reference'
  allocated_amount?: string
  version: number
  source: 'rule' | 'product' | 'variant'
  rule_id: number | null
  rule_revision: number | null
  amount: string
  base_amount?: string
  promotion?: import('./promotion-types').PromotionSnapshot
  branch_id: number
  branch_name: string
  channel: OrderChannel
  variant_id: number | null
  scope_branch_id: number | null
  scope_channel: 'all' | OrderChannel | null
}
export type ContextPrice = {
  id: number
  product_id: number
  variant_id: number | null
  branch_id: number | null
  channel: 'all' | OrderChannel
  amount: string
  is_active: boolean
  revision: number
  branch: { id: number; name: string; is_active: boolean } | null
}
