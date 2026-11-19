import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCan, useSession } from '../auth/SessionProvider'
import './environment.css'

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
  useEffect(() => {
    document.body.classList.add('terminal-active')
    return () => document.body.classList.remove('terminal-active')
  }, [])
  const links = [
    { to: '/terminal/mesas', label: 'Mesas', permission: 'dining.view' },
    { to: '/pos', label: 'Terminal POS', permission: 'sales.collect' },
    { to: '/pedidos', label: 'Pedidos', permission: 'orders.view' },
    { to: '/caja', label: 'Caja rápida', permission: 'cash.view' },
    { to: '/salones/reservas', label: 'Reservas', permission: 'dining.reserve' },
  ]
  return (
    <section
      className="terminal-environment"
      data-environment="terminal"
      data-screen={
        pathname.includes('cobrar')
          ? 'payment'
          : pathname.includes('mesas')
            ? 'tables'
            : 'operation'
      }
    >
      <header className="terminal-header">
        <Link to="/terminal/mesas" className="terminal-brand">
          NEXORA <span>TERMINAL</span>
        </Link>
        <nav aria-label="Navegación operativa">
          {links
            .filter((link) => can(link.permission))
            .map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={pathname === link.to ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
        </nav>
        <span className="terminal-operator">{session?.user.name}</span>
        <button type="button" aria-label="Bloquear pantalla" onClick={onLock}>
          Bloquear
        </button>
        <button type="button" aria-label="Cerrar sesión" onClick={onLogout}>
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
        <Link to="/inicio">Admin</Link>
      </header>
      <div className="terminal-content">{children}</div>
      <footer className="terminal-footer">
        <span>Nexora POS · El futuro de tu restaurante.</span>
        <span>Operación de restaurante</span>
      </footer>
    </section>
  )
}
