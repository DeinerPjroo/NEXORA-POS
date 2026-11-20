import { Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import type { Order } from '../operations/types'
import './order-identity.css'

export const orderChannels = {
  dine_in: { label: 'Mesa', icon: UtensilsCrossed },
  takeaway: { label: 'Para llevar', icon: ShoppingBag },
  delivery: { label: 'Domicilio', icon: Bike },
}

export function OrderIdentity({ order }: { order: Order }) {
  const { label, icon: Icon } = orderChannels[order.channel]
  const tables = order.dining_snapshot?.tables.map((table) => table.name).join(' + ')
  return (
    <div className="order-identity">
      <span className="order-channel-badge">
        <Icon size={15} aria-hidden="true" />
        {label}
      </span>
      <strong className="order-identity-title">
        {order.channel === 'dine_in'
          ? tables || 'Sin mesa asignada'
          : order.customer_name || 'Cliente sin nombre'}
      </strong>
      {order.channel === 'dine_in' && tables && (
        <small>
          Ubicación al registrar{order.customer_name ? ` · ${order.customer_name}` : ''}
        </small>
      )}
    </div>
  )
}
