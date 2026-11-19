import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Tags,
  PanelLeftClose,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X,
  Wallet,
  ShoppingBag,
  ReceiptText,
  Monitor,
  LockKeyhole,
} from 'lucide-react'
import { api } from '../lib/api'
import { Brand, ErrorNotice, Loading, useToast } from './ui'
import { useCan, useSession } from '../features/auth/SessionProvider'
import { posPermissions } from '../features/pos/pos-permissions'
import { clearPosContext } from '../features/pos/pos-context'
import { homePath } from '../features/auth/home'
import { ScreenLock } from '../features/auth/ScreenLock'
import { screenChanged } from '../features/auth/screen-events'
import { verificationReturn } from '../features/auth/verification-link'

const navigation = [
  {
    to: '/pos',
    label: 'Terminal POS',
    icon: Monitor,
    permission: 'orders.manage',
    required: posPermissions,
  },
  { to: '/inicio', label: 'Vista general', icon: LayoutDashboard, permission: 'dashboard.view' },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingBag, permission: 'orders.view' },
  { to: '/salones', label: 'Salones y mesas', icon: Building2, permission: 'dining.view' },
  { to: '/salones/reservas', label: 'Reservas', icon: Building2, permission: 'dining.reserve' },
  { to: '/ventas', label: 'Ventas', icon: ReceiptText, permission: 'sales.view' },
  { to: '/caja', label: 'Caja', icon: Wallet, permission: 'cash.view' },
  { to: '/productos', label: 'Productos', icon: Package, permission: 'catalog.view' },
  { to: '/categorias', label: 'Categorías', icon: Tags, permission: 'catalog.view' },
  { to: '/sucursales', label: 'Sucursales', icon: Building2, permission: 'branches.view' },
  { to: '/equipo', label: 'Mi equipo', icon: Users, permission: 'team.view' },
  { to: '/roles', label: 'Roles y permisos', icon: ShieldCheck, permission: 'roles.view' },
  { to: '/studio', label: 'Nexora Studio', icon: Sparkles, permission: 'studio.view' },
  { to: '/configuracion', label: 'Configuración', icon: Settings2, permission: 'settings.view' },
]

export function AppShell() {
  const location = useLocation()
  const { session, pending, error, reload, screenBlocked } = useSession()
  const can = useCan()
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [loggingOut, setLoggingOut] = useState(false)
  const [locking, setLocking] = useState(false)
  const client = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (pending) return <Loading />
  if (error && !session)
    return (
      <div className="connection-error">
        <Brand />
        <h1>No pudimos abrir tu espacio</h1>
        <ErrorNotice error={error} />
        <button className="button primary" onClick={reload}>
          Volver a intentar
        </button>
      </div>
    )
  if (!session) {
    const verification =
      location.pathname === '/verificar-correo'
        ? new URLSearchParams(location.search).get('verificacion')
        : null
    return (
      <Navigate
        to={
          verificationReturn(verification)
            ? `/ingresar?verificar=${encodeURIComponent(verification!)}`
            : '/ingresar'
        }
        replace
      />
    )
  }
  async function logout() {
    setLoggingOut(true)
    try {
      await api('auth/logout', { method: 'POST' })
      clearPosContext(session!)
      client.clear()
      navigate('/ingresar', { replace: true })
      reload()
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'No se pudo cerrar la sesión.')
      setLoggingOut(false)
    }
  }
  async function lock() {
    setLocking(true)
    try {
      await api('auth/screen/lock', { method: 'POST' })
      window.dispatchEvent(new Event('nexora:screen-locked'))
      screenChanged()
    } catch (failure) {
      // Fail closed locally after an uncertain response; obtain the real server state.
      window.dispatchEvent(new Event('nexora:screen-locked'))
      toast(failure instanceof Error ? failure.message : 'No se pudo confirmar el bloqueo.')
    } finally {
      setLocking(false)
    }
  }
  const initials = session.user.name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  return (
    <>
      <div
        data-screen-blocked={screenBlocked || locking}
        inert={screenBlocked || locking}
        className={`app-shell ${collapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}
      >
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        {mobile && (
          <button
            className="sidebar-backdrop"
            aria-label="Cerrar menú"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <Brand compact={collapsed} />
            <button
              className="icon-button sidebar-close"
              aria-label="Cerrar menú"
              onClick={() => setMobile(false)}
            >
              <X size={20} />
            </button>
          </div>
          <Link className="workspace-switch" to="/configuracion" onClick={() => setMobile(false)}>
            <span className="workspace-icon">
              <Building2 size={20} />
            </span>
            {!collapsed && (
              <>
                <span>
                  <strong>{session.company.name}</strong>
                  <small>Espacio de trabajo</small>
                </span>
                <ChevronRight size={16} />
              </>
            )}
          </Link>
          <p className="nav-label">{collapsed ? '···' : 'ADMINISTRACIÓN'}</p>
          <nav aria-label="Navegación principal">
            {navigation
              .filter(
                (item) =>
                  can(item.permission) && (!('required' in item) || item.required?.every(can)),
              )
              .map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={19} />
                  {!collapsed && <span>{label}</span>}
                  {to === '/studio' && !collapsed && <span className="nav-new">NUEVO</span>}
                </NavLink>
              ))}
          </nav>
          {!collapsed && (
            <div className="sidebar-studio">
              <div className="studio-small-icon">
                <Sparkles size={20} />
              </div>
              <h3>Tan único como tú.</h3>
              <p>
                Haz que tu sistema
                <br />
                hable de tu restaurante.
              </p>
              {can('studio.view') && (
                <Link to="/studio">
                  Personalizar mi espacio <ArrowUpRight size={15} />
                </Link>
              )}
            </div>
          )}
          <div className="sidebar-bottom">
            <Link className="help-link" to="/mi-seguridad" title="Seguridad personal">
              <LockKeyhole size={18} />
              {!collapsed && <span>Seguridad personal</span>}
            </Link>
            <Link className="help-link" to="/acerca" title="Acerca de Nexora">
              <CircleHelp size={18} />
              {!collapsed && <span>Acerca de Nexora</span>}
            </Link>
            <button
              className="collapse-button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Plegar barra lateral'}
            >
              {collapsed ? (
                <ChevronRight size={18} />
              ) : (
                <>
                  <PanelLeftClose size={18} />
                  <span>Plegar menú</span>
                  <ChevronLeft size={14} />
                </>
              )}
            </button>
            <div className="user-card">
              <span className="avatar">{initials}</span>
              {!collapsed && (
                <span>
                  <strong>{session.user.name}</strong>
                  <small>{session.role.name}</small>
                </span>
              )}
              <button
                className="icon-button"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                onClick={() => void logout()}
                disabled={loggingOut}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace-main">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-toggle"
                aria-label="Abrir menú"
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <span>Mi espacio</span>
              <ChevronRight size={13} />
              <strong>{session.company.name}</strong>
            </div>
            <div className="topbar-meta">
              <button
                className="icon-button"
                aria-label="Bloquear pantalla"
                title="Bloquear pantalla"
                disabled={locking}
                onClick={() => void lock()}
              >
                <LockKeyhole size={19} />
              </button>
              <span className={`connection-pill ${online ? '' : 'offline'}`}>
                {online ? <Wifi size={14} /> : <WifiOff size={14} />}
                {online ? 'Conexión disponible' : 'Sin conexión'}
              </span>
              <span className="environment-tag">{session.company.currency}</span>
              <span className="avatar small">{initials}</span>
            </div>
          </header>
          {!online && (
            <div className="offline-banner" role="status">
              Sin conexión a internet. Las operaciones necesitan conexión con el servidor.
            </div>
          )}
          <main id="contenido" tabIndex={-1} className="page-content">
            <Outlet />
          </main>
          <footer className="workspace-footer">
            <span>
              NEXORA POS <span> / </span> El futuro de tu restaurante.
            </span>
            <span>Tu negocio, a tu manera.</span>
          </footer>
        </div>
      </div>
      {screenBlocked && <ScreenLock logout={logout} />}
    </>
  )
}

export function PermissionBoundary({
  permission,
  children,
}: {
  permission: string
  children: React.ReactNode
}) {
  const can = useCan()
  const { session } = useSession()
  return can(permission) ? (
    children
  ) : (
    <div className="empty-state">
      <ShieldCheck size={36} />
      <h1>Acceso restringido</h1>
      <p>Tu rol no permite consultar esta sección.</p>
      <Link to={session ? homePath(session) : '/ingresar'} className="button secondary">
        Volver a mi espacio
      </Link>
    </div>
  )
}
