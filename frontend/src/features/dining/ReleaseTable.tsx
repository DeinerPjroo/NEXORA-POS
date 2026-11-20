import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorNotice } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { DiningSession } from './session-types'

export function ReleaseTable({
  session,
  label,
  onClose,
}: {
  session: { id: number; revision: number }
  label: string
  onClose: () => void
}) {
  const [snapshot] = useState(session)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  const client = useQueryClient()
  const operation = useOperation<DiningSession>(
    `dining-sessions/${snapshot.id}/close`,
    async () => {
      await Promise.all(
        [
          'dining-occupancy',
          'dining-available',
          'dining-session',
          'dining-sessions',
          'table-active-order',
          'table-orders',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      )
      onClose()
    },
  )
  return (
    <dialog
      ref={dialog}
      className="release-table-panel"
      aria-label="Liberar mesa"
      onCancel={(event) => {
        event.preventDefault()
        if (!operation.locked) onClose()
      }}
    >
      <span className="release-table-label">{label}</span>
      <h3>¿La mesa ya quedó desocupada?</h3>
      <p>Las mesas unidas también quedarán libres.</p>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={operation.locked}
          onClick={onClose}
        >
          No, volver
        </button>
        <button
          type="button"
          className="button primary"
          disabled={operation.isPending}
          onClick={() => operation.send({ revision: snapshot.revision })}
        >
          {operation.uncertain ? 'Reintentar liberación' : 'Sí, liberar mesa'}
        </button>
      </div>
    </dialog>
  )
}
