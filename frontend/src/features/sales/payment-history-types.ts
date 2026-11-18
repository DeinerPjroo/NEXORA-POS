import type { CatalogPage } from '../catalog/types'
import type { Sale } from './types'

export type ReviewStatus = 'pending' | 'matched' | 'difference'
export type PaymentReview = {
  id: number
  payment_id: number
  version: number
  sale_revision: number
  currency: string
  status: ReviewStatus
  expected_net_amount: string
  observed_amount: string | null
  difference_amount: string | null
  reference: string | null
  notes: string | null
  actor_name: string
  review_confirmed: boolean
  provenance: 'operator'
  created_at: string
}
export type PaymentEntry = {
  id: number
  sale_id: number
  branch_id: number
  branch_name: string
  account_label: string | null
  cash_session_id: number
  method_name: string
  method_kind: 'cash' | 'non_cash'
  provenance: 'operator'
  reference: string | null
  applied_amount: string
  refunded_amount: string
  net_paid_amount: string
  refunds_count: number
  currency: string
  receipt_code: string
  sale_status: Sale['status']
  sale_revision: number
  received_amount: string
  change_amount: string
  created_at: string
  review_revision: number
  review_status: ReviewStatus | 'stale' | 'not_applicable'
  latest_review: PaymentReview | null
}
type Summary = {
  currency: string
  count: number
  applied_amount: string
  refunded_amount: string
  net_paid_amount: string
}
export type HistoryPage = CatalogPage<PaymentEntry> & { summary: Summary[]; timezone: string }
export const reviewStates = {
  pending: 'Pendiente de revisión',
  matched: 'Revisado manualmente',
  difference: 'Diferencia declarada',
  stale: 'Requiere nueva revisión',
  not_applicable: 'Efectivo · Revisar en caja',
}
