import type { Session } from '../../lib/types'
import type { OrderChannel } from '../catalog/context-price-types'

export function posContextKey(session: Session) {
  return `nexora:pos:${session.company.id}:${session.user.id}`
}

export function loadPosContext(session: Session): {
  branchId: number | null
  channel: OrderChannel
} {
  try {
    const data = JSON.parse(sessionStorage.getItem(posContextKey(session)) ?? 'null')
    return {
      branchId: Number.isSafeInteger(data?.branchId) && data.branchId > 0 ? data.branchId : null,
      channel: data?.channel === 'dine_in' ? 'dine_in' : 'takeaway',
    }
  } catch {
    return { branchId: null, channel: 'takeaway' }
  }
}

export function savePosContext(session: Session, branchId: number, channel: OrderChannel) {
  try {
    sessionStorage.setItem(posContextKey(session), JSON.stringify({ branchId, channel }))
  } catch {
    /* La selección actual sigue operativa si el navegador bloquea preferencias. */
  }
}

export function clearPosContext(session: Session) {
  try {
    sessionStorage.removeItem(posContextKey(session))
  } catch {
    /* No bloquear el cierre de sesión. */
  }
}
