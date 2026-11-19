import type { Session } from '../../lib/types'
import { posPermissions } from '../pos/pos-permissions'

export function homePath(session: Session): string {
  const can = (permission: string) => session.permissions.includes(permission)
  if (
    can('dashboard.view') &&
    (session.role.is_owner || can('settings.manage') || can('roles.manage'))
  )
    return '/inicio'
  if (posPermissions.every(can)) return '/pos'
  const sections = [
    ['orders.view', '/pedidos'],
    ['dining.view', '/salones'],
    ['dining.reserve', '/salones/reservas'],
    ['kitchen.view', '/cocina/estaciones'],
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
