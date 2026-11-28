export type Delivery = {
  id: number
  order_id: number
  branch_id: number
  revision: number
  recipient_name: string
  phone: string
  address: string
  neighborhood?: string | null
  location_reference?: string | null
  instructions: string | null
  courier_id: number | null
  courier_name: string | null
  status:
    'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'failed' | 'returned'
  preparation_status: 'open' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  created_at: string
  events: {
    id: number
    status: string
    reason: string | null
    created_at: string
    actor?: { id: number; name: string } | null
    courier?: { id: number; name: string } | null
  }[]
}
export const deliveryLabels = {
  pending: 'Sin asignar',
  assigned: 'Repartidor asignado',
  out_for_delivery: 'En reparto',
  delivered: 'Entregado al cliente',
  cancelled: 'Cancelado',
  failed: 'Entrega fallida',
  returned: 'Devuelto al restaurante',
}
export const deliveryKitchenLabels = {
  open: 'Cocina pendiente',
  preparing: 'En preparación',
  ready: 'Listo en cocina',
  delivered: 'Salida de cocina',
  cancelled: 'Cocina cancelada',
}
