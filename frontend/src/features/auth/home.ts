import type { Session } from '../../lib/types'
import { posPermissions } from '../pos/pos-permissions'

export function adminPath(session: Session): string | null {
  const entries = [
    ['dashboard.view', '/inicio'],
    ['settings.view', '/configuracion'],
    ['team.view', '/equipo'],
    ['roles.view', '/roles'],
    ['branches.view', '/sucursales'],
    ['studio.view', '/studio'],
    ['catalog.manage', '/productos'],
    ['catalog.costs', '/productos'],
    ['dining.manage', '/salones'],
    ['kitchen.manage', '/cocina/estaciones'],
  ]
  return entries.find(([permission]) => session.permissions.includes(permission))?.[1] ?? null
}

export function homePath(session: Session): string {
  const can = (permission: string) => session.permissions.includes(permission)
  if (
    can('dashboard.view') &&
    (session.role.is_owner || can('settings.manage') || can('roles.manage'))
  )
    return '/inicio'
  if (posPermissions.every(can))
    return can('dining.view') && can('dining.operate') ? '/pos' : '/terminal/recogidas'
  if (can('deliveries.operate') && !can('orders.manage')) return '/terminal/domicilios'
  if (can('kitchen.view') && !can('orders.manage')) return '/terminal/cocina'
  if (can('dining.view') && can('dining.operate')) return '/terminal/mesas'
  const sections = [
    ['orders.view', '/pedidos'],
    ['dining.view', '/terminal/mesas'],
    ['dining.reserve', '/salones/reservas'],
    ['kitchen.view', '/terminal/cocina'],
    ['cash.view', '/caja'],
    ['catalog.view', '/productos'],
    ['sales.view', '/ventas'],
    ['dashboard.view', '/inicio'],
    ['team.view', '/equipo'],
    ['branches.view', '/sucursales'],
    ['settings.view', '/configuracion'],
    ['studio.view', '/studio'],
    ['roles.view', '/roles'],
  ]
  return sections.find(([permission]) => can(permission))?.[1] ?? '/acerca'
}

export function terminalPath(session: Session): string {
  const can = (key: string) => session.permissions.includes(key)
  if (posPermissions.every(can))
    return can('dining.view') && can('dining.operate') ? '/pos' : '/terminal/recogidas'
  if (can('deliveries.operate') && !can('orders.manage')) return '/terminal/domicilios'
  if (can('kitchen.view') && !can('orders.manage')) return '/terminal/cocina'
  if (can('dining.view')) return '/terminal/mesas'
  if (can('orders.view')) return '/pedidos'
  if (can('cash.view')) return '/caja'
  return homePath(session)
}
