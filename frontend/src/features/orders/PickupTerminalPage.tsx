import { useCan } from '../auth/SessionProvider'
import { OrderComposer } from './OrderComposer'
import { OrdersPage } from './OrdersPage'

export function PickupTerminalPage() {
  const can = useCan()
  return can('catalog.view') && can('orders.manage') ? (
    <OrderComposer terminal initialChannel="takeaway" />
  ) : (
    <OrdersPage channel="takeaway" />
  )
}
