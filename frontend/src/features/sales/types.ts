import type { OrderItem } from '../operations/types'

export type SalesSettings = {
  configured: boolean
  tax_mode: 'none' | 'exclusive'
  tax_name: string
  tax_rate: string
  revision: number
  rounding: 'half_up'
  decimal_places: number
}
export type SaleQuote = {
  currency: string
  catalog_subtotal: string
  subtotal: string
  rounding_adjustment: string
  discount_amount: string
  taxable_base: string
  tax_mode: 'none' | 'exclusive'
  tax_name: string
  tax_rate: string
  tax_amount: string
  total: string
  settings_revision: number
  order_revision: number
}
export type Sale = Omit<SaleQuote, 'order_revision'> & {
  id: number
  order_id: number
  branch_id: number
  status: 'paid' | 'refunded'
  business_name: string
  branch_name: string
  branch_address: string | null
  receipt_code: string
  discount_reason: string | null
  created_at: string
  items?: OrderItem[]
  reference?: string | null
  payment?: {
    id: number
    cash_session_id: number
    amount: string
    method: 'cash'
    received_amount: string
    change_amount: string
    created_at: string
  }
  refund?: {
    id: number
    amount: string
    reason: string
    created_at: string
    cash_session_id: number
  } | null
}
export type CashOption = { id: number; name: string; revision: number; currency: string }
