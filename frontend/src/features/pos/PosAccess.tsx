import type { ReactNode } from 'react'
import { PermissionBoundary } from '../../components/AppShell'
import { useCan } from '../auth/SessionProvider'

import { posPermissions } from './pos-permissions'

export function PosAccess({
  children,
  takingOrder = false,
}: {
  children: ReactNode
  takingOrder?: boolean
}) {
  const can = useCan()
  const missing = posPermissions
    .filter((permission) => !takingOrder || permission !== 'sales.collect')
    .find((permission) => !can(permission))
  return missing ? (
    <PermissionBoundary permission={missing}>{children}</PermissionBoundary>
  ) : (
    children
  )
}
