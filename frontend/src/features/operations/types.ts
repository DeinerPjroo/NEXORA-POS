export type OperationalBranch = { id: number; name: string; is_active: boolean }
export type OperationContext = { branches: OperationalBranch[]; currency: string }
export type CashSession = {
  id: number
  branch_id: number
  cash_register_id: number
  register_name?: string
  status: 'open' | 'closed'
  currency: string
  opening_amount: string
  expected_amount: string
  counted_amount: string | null
  difference: string | null
  revision: number
  closing_note: string | null
  opened_at: string
  closed_at: string | null
}
export type CashRegister = {
  id: number
  branch_id: number
  name: string
  code: string
  is_active: boolean
  current_session: CashSession | null
}
export type CashMovement = {
  id: number
  type: 'income' | 'expense'
  amount: string
  reason: string
  created_at: string
}
export type OrderStatus = 'open' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type OrderItem = {
  base_unit_price?: string | null
  modifiers_snapshot?: import('../catalog/modifier-types').ModifierSnapshot[] | null
  tax_snapshot?: import('../sales/tax-types').TaxSnapshot | null
  id: number
  product_id: number
  variant_id: number | null
  product_name: string
  variant_name: string | null
  sku: string
  quantity: number
  unit_price: string
  line_subtotal: string
  notes: string | null
}
export type OrderEvent = {
  id: number
  from_status: OrderStatus | null
  to_status: OrderStatus
  reason: string | null
  created_at: string
}
export type Order = {
  id: number
  public_id: string
  branch_id: number
  branch_name?: string
  channel: 'dine_in' | 'takeaway'
  reference: string | null
  customer_name: string | null
  notes: string | null
  currency: string
  subtotal: string
  status: OrderStatus
  revision: number
  items_count: number | null
  sale_id: number | null
  sale_status: 'paid' | 'partially_paid' | 'partially_refunded' | 'refunded' | null
  items?: OrderItem[]
  events?: OrderEvent[]
  created_at: string
}
export const orderStates: Record<OrderStatus, string> = {
  open: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}
