import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCan, useSession } from '../auth/SessionProvider'
import { adminPath, terminalPath } from '../auth/home'
import { posPermissions } from './pos-permissions'
import './environment.css'

const TerminalGuard = createContext<React.Dispatch<
  React.SetStateAction<{ navigation: boolean; controls: boolean }>
> | null>(null)
const TerminalOrders = createContext<React.Dispatch<
  React.SetStateAction<(() => void) | null>
> | null>(null)
export function useTerminalOrders(open: (() => void) | null) {
  const register = useContext(TerminalOrders)
  useEffect(() => {
    register?.(() => open)
    return () => register?.(null)
  }, [register, open])
}
export function useTerminalGuard(navigation: boolean, controls: boolean) {
  const setGuard = useContext(TerminalGuard)
  useEffect(() => {
    setGuard?.({ navigation, controls })
    return () => setGuard?.({ navigation: false, controls: false })
  }, [setGuard, navigation, controls])
}

export function isTerminalRoute(path: string) {
  return (
    /^\/(terminal|pos|pedidos|caja)(\/|$)/.test(path) ||
    /^\/salones\/(atenciones|reservas)(\/|$)/.test(path) ||
    /^\/ventas\/\d+(\/|$)/.test(path)
  )
}

export function TerminalEnvironment({
  children,
  onLock,
  onLogout,
}: {
  children: ReactNode
  onLock: () => void
  onLogout: () => void
}) {
  const { session } = useSession()
  const can = useCan()
  const { pathname } = useLocation()
  const isKitchen = pathname === '/terminal/cocina'
  const admin = session ? adminPath(session) : null
  const home = session ? terminalPath(session) : '/ingresar'
  const [guard, setGuard] = useState({ navigation: false, controls: false })
  const [openOrders, setOpenOrders] = useState<(() => void) | null>(null)
  useEffect(() => {
    document.body.classList.add('terminal-active')
    return () => document.body.classList.remove('terminal-active')
  }, [])
  const links = [
    { to: '/terminal/mesas', label: 'Mesas', permission: 'dining.view' },
    { to: '/pos', label: 'Terminal POS', permission: 'sales.collect' },
    { to: '/pedidos', label: 'Pedidos', permission: 'orders.view' },
    { to: '/terminal/recogidas', label: 'Para llevar', permission: 'orders.view' },
    { to: '/terminal/domicilios', label: 'Domicilios', permission: 'orders.view' },
    { to: '/caja', label: 'Caja rápida', permission: 'cash.view' },
    { to: '/terminal/cocina', label: 'Cocina', permission: 'kitchen.view' },
    { to: '/salones/reservas', label: 'Reservas', permission: 'dining.reserve' },
  ]
  const navigationProps = {
    'aria-disabled': guard.navigation || undefined,
    tabIndex: guard.navigation ? -1 : undefined,
    onClick: (event: React.MouseEvent) => {
      if (guard.navigation) event.preventDefault()
    },
  }
  return (
    <TerminalGuard.Provider value={setGuard}>
      <TerminalOrders.Provider value={setOpenOrders}>
        <section
          className="terminal-environment"
          data-environment="terminal"
          data-screen={
            isKitchen
              ? 'kitchen'
              : pathname.includes('cobrar')
                ? 'payment'
                : pathname.includes('mesas')
                  ? 'tables'
                  : 'operation'
          }
        >
          <header className="terminal-header" inert={guard.controls}>
            <Link to={home} {...navigationProps} className="terminal-brand">
              NEXORA <span>{isKitchen ? 'KITCHEN' : 'TERMINAL'}</span>
            </Link>
            <nav aria-label="Navegación operativa">
              {links
                .filter(
                  (link) =>
                    can(link.permission) &&
                    (link.to !== '/pos' || posPermissions.every(can)) &&
                    (link.to !== '/terminal/domicilios' ||
                      can('orders.manage') ||
                      can('deliveries.operate')),
                )
                .map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    {...navigationProps}
                    onClick={(event) => {
                      navigationProps.onClick(event)
                      if (!event.defaultPrevented && link.to === '/pedidos' && openOrders) {
                        event.preventDefault()
                        openOrders()
                      }
                    }}
                    title={
                      guard.navigation
                        ? 'Guarda o envía el pedido antes de cambiar de sección'
                        : undefined
                    }
                    aria-current={
                      pathname === link.to ||
                      (link.to === '/pedidos' && pathname.startsWith('/pedidos/')) ||
                      (link.to === '/caja' && pathname.startsWith('/caja/')) ||
                      (link.to === '/pos' && pathname.startsWith('/pos/'))
                        ? 'page'
                        : undefined
                    }
                  >
                    {link.label}
                  </Link>
                ))}
            </nav>
            <span className="terminal-operator">{session?.user.name}</span>
            <button type="button" aria-label="Bloquear pantalla" onClick={onLock}>
              Bloquear
            </button>
            <button
              type="button"
              aria-label="Cerrar sesión"
              disabled={guard.navigation}
              onClick={onLogout}
            >
              Salir
            </button>
            <button
              type="button"
              aria-label="Pantalla completa"
              onClick={() => {
                const action = document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen()
                void action.catch(() => {})
              }}
            >
              ⛶
            </button>
            {admin && (
              <Link to={admin} {...navigationProps}>
                Admin
              </Link>
            )}
          </header>
          <div className="terminal-content">{children}</div>
          <footer className="terminal-footer">
            <span>Nexora POS · El futuro de tu restaurante.</span>
            <span>Operación de restaurante</span>
          </footer>
        </section>
      </TerminalOrders.Provider>
    </TerminalGuard.Provider>
  )
}
