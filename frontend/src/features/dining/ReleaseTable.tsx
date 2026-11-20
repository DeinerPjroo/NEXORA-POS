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
  const [confirmed, setConfirmed] = useState(false)
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
      <h3>Liberar {label}</h3>
      <p>
        La atención se cerrará y sus mesas quedarán disponibles. Los pedidos y pagos se conservan.
      </p>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={operation.locked}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Confirmo que los clientes ya se retiraron.
      </label>
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={operation.locked}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button primary"
          disabled={operation.isPending || (!operation.uncertain && !confirmed)}
          onClick={() => operation.send({ revision: snapshot.revision })}
        >
          {operation.uncertain ? 'Reintentar liberación' : 'Confirmar liberación'}
        </button>
      </div>
    </dialog>
  )
}
