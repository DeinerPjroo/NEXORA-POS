import type { OrderItem } from '../operations/types'
import type { TaxBreakdown, TaxSnapshot, TaxLine } from './tax-types'
export type DeliveryCharge = TaxLine & {
  currency: string
  version: number
  tax_amount: string
  policy_revision: number
  zone_revision: number | null
  zone_name: string | null
  source: string
  goods_tax_amount?: string
  goods_taxable_base?: string
}

export type PaymentMethod = {
  id: number
  code: string
  name: string
  kind: 'cash' | 'non_cash'
  is_active: boolean
  is_system: boolean
  revision: number
  provenance: 'operator'
}

export type SalesSettings = {
  configured: boolean
  tax_mode: 'none' | 'exclusive' | 'inclusive' | 'product'
  tax_name: string
  tax_rate: string
  revision: number
  rounding: 'half_up'
  decimal_places: number
  tip_enabled: boolean
  tip_tax_mode: 'included' | 'excluded' | null
  tip_tax_snapshot: TaxSnapshot | null
}
export type SaleQuote = {
  delivery_charge?: DeliveryCharge | null
  delivery_fee_total?: string
  tax_breakdown: TaxBreakdown | null
  calculation_version: number
  accounts_preview: AccountPart[]
  currency: string
  catalog_subtotal: string
  subtotal: string
  rounding_adjustment: string
  discount_amount: string
  taxable_base: string
  tax_mode: 'none' | 'exclusive' | 'inclusive' | 'product'
  tax_name: string
  tax_rate: string
  tax_amount: string
  total: string
  settings_revision: number
  order_revision: number
  discount_type: 'fixed' | 'percentage'
  discount_value: string
  tip_amount: string
  tip_tax_mode: 'included' | 'excluded' | 'disabled'
}
export type AccountPart = { number: number; label: string; amount: string }
export type SaleAccount = AccountPart & {
  id: number
  paid_amount: string
  refunded_amount: string
  net_paid_amount: string
  balance_due: string
  cancelled_balance: string
  effective_total: string
}
export type Sale = Omit<SaleQuote, 'order_revision' | 'accounts_preview'> & {
  customer_name?: string | null
  channel?: 'dine_in' | 'takeaway' | 'delivery'
  dining_snapshot?: import('../operations/types').Order['dining_snapshot']
  accounts: SaleAccount[]
  id: number
  order_id: number
  branch_id: number
  status: 'paid' | 'partially_paid' | 'partially_refunded' | 'refunded'
  revision: number
  paid_amount: string
  balance_due: string
  refunded_amount: string
  net_paid_amount: string
  effective_total: string
  cancelled_balance: string
  tip_confirmed: boolean
  payments: SalePayment[]
  refunds: SaleRefund[]
  business_name: string
  branch_name: string
  branch_address: string | null
  receipt_code: string
  discount_reason: string | null
  created_at: string
  items?: OrderItem[]
  combos?: import('../operations/types').OrderCombo[]
  reference?: string | null
  payment?: {
    id: number
    account_id: number | null
    cash_session_id: number
    amount: string
    refunded_amount: string
    refundable_amount: string
    method: string
    method_name: string
    method_kind: 'cash' | 'non_cash'
    payment_method_id: number
    method_revision: number
    provenance: 'operator'
    reference: string | null
    received_amount: string
    change_amount: string
    created_at: string
  }
  refund?: {
    id: number
    amount: string
    reason: string
    reference: string | null
    created_at: string
    cash_session_id: number
  } | null
}
export type CashOption = { id: number; name: string; revision: number; currency: string }
export type SalePayment = NonNullable<Sale['payment']>
export type SaleRefund = NonNullable<Sale['refund']> & { payment_id: number }
export const saleStates = {
  paid: 'Cobrada',
  partially_paid: 'Abonada',
  partially_refunded: 'Devolución parcial',
  refunded: 'Devuelta',
}
