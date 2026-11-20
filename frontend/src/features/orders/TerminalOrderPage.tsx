import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { OrderComposer } from './OrderComposer'
import { useCan } from '../auth/SessionProvider'

// Keep older links working without mixing channels inside an active terminal.
export function TerminalOrderPage() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const channel = params.get('canal')
  const can = useCan()
  if (channel === 'takeaway') return <Navigate to="/terminal/recogidas" replace />
  if (channel === 'delivery' || pathname === '/terminal/domicilios/nuevo')
    return pathname !== '/terminal/domicilios/nuevo' ? (
      <Navigate to="/terminal/domicilios/nuevo" replace />
    ) : (
      <OrderComposer key="delivery" terminal initialChannel="delivery" />
    )
  return can('dining.view') && can('dining.operate') ? (
    <OrderComposer key="tables" terminal initialChannel="dine_in" />
  ) : (
    <Navigate to="/terminal/recogidas" replace />
  )
}
