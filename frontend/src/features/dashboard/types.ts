export type Totals = {
  currency: string
  sales_count: number
  payment_count: number
  refund_count: number
  sales_total: string
  applied_amount: string
  refunded_amount: string
  net_paid_amount: string
  balance_due: string
  tax_amount: string
  tip_amount: string
  average_ticket: string
}
export type DailyPoint = {
  currency: string
  date: string
  sales_count: number
  sales_total: string
  applied_amount: string
  refunded_amount: string
  net_paid_amount: string
}
export type CommercialReport = {
  timezone: string
  currency: string
  generated_at: string
  period: { from: string; to: string; days: number; previous_from: string; previous_to: string }
  branch_id: number | null
  branches: { id: number; name: string; is_active: boolean }[]
  cash_expenses: { currency: string; count: number; amount: string }[] | null
  live: {
    orders_active: number | null
    tables_occupied: number | null
    cash_sessions_open: number | null
  }
  sales: {
    currencies: {
      currency: string
      current: Totals
      previous: Totals
      sales_change: { amount: string; percent: string | null }
      net_change: { amount: string; percent: string | null }
    }[]
    series: DailyPoint[]
    methods: {
      currency: string
      name: string
      kind: string
      payment_count: number
      refund_count: number
      applied_amount: string
      refunded_amount: string
      net_paid_amount: string
    }[]
    products: { currency: string; product_id: number; name: string; quantity: number }[]
    hours: { currency: string; hour: string; count: number; amount: string }[]
    operators: { currency: string; user_id: number; name: string; count: number; amount: string }[]
  } | null
}
