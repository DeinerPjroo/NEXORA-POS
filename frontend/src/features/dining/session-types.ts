export type DiningSession = {
  id: number
  branch_id: number
  status: 'open' | 'closed'
  guest_count: number
  waiter_id: number | null
  waiter_name: string | null
  notes: string | null
  revision: number
  opened_at: string
  closed_at: string | null
  orders_count: number
  tables: {
    dining_table_id: number
    table_name: string
    table_revision: number
    capacity: number
    joined_at: string
    released_at: string | null
  }[]
  orders?: { id: number; revision: number; status: string; sale_id: number | null }[]
  events?: { id: number; action: string; created_at: string; details: Record<string, unknown> }[]
}
export type TableChoice = {
  id: number
  name: string
  revision: number
  capacity: number
  room_name?: string
}
export type DiningSelection = { id: number; revision: number; branch_id: number; label: string }
