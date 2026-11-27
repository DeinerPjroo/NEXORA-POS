import type { KitchenDisplay } from './kitchen-display'

export type KitchenTicket = {
  display_snapshot?: KitchenDisplay
  id: number
  order_id: number
  branch_id: number
  kitchen_station_id: number
  station_name: string
  station_color: string
  target_minutes: number
  priority: number
  revision: number
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  created_at: string
  started_at: string | null
  ready_at: string | null
  delivered_at: string | null
  order_snapshot: {
    customer_name?: string | null
    channel: string
    reference: string | null
    notes: string | null
    dining: { tables?: { name?: string; table_name?: string }[] } | null
  }
  lines: {
    id: number
    order_item_id: number
    item_change?: {
      id: number
      reason: string
      replacement_item_id: number | null
      created_at: string
    } | null
    product_name: string
    variant_name: string | null
    quantity: number
    preparation_destination?: 'table' | 'takeaway'
    corrections?: {
      id: number
      reason: string
      from_destination: string
      to_destination: string
      created_at: string
    }[]
    notes: string | null
    preparations: { name: string; options: string[] }[]
  }[]
  events: {
    actor?: { id: number; name: string } | null
    id: number
    from_status: string | null
    to_status: string
    reason: string | null
    created_at: string
  }[]
}
