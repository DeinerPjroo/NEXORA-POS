import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, useToast } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { preparationLabels } from './TableKitchen'
type Preview = {
  order_id: number
  order_revision: number
  status: string
  lines: {
    id: number
    name: string
    quantity: number
    preparation_destination?: 'table' | 'takeaway'
    station: { id: number; name: string } | null
  }[]
}
export function KitchenSend({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  const client = useQueryClient()
  const toast = useToast()
  const query = useQuery({
    queryKey: ['kitchen-preview', orderId],
    queryFn: () => api<{ data: Preview }>(`orders/${orderId}/kitchen-preview`),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
  })
  const operation = useOperation(`orders/${orderId}/kitchen-dispatch`, async () => {
    await Promise.all(
      ['kitchen-tickets', 'kitchen-preview', 'orders', 'order', 'table-active-order'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    toast('Comanda enviada a cocina.')
    onClose()
  })
  const invalid =
    !query.data ||
    query.isFetching ||
    query.isError ||
    !query.data.data.lines.length ||
    query.data.data.lines.some((line) => !line.station) ||
    ['cancelled', 'delivered'].includes(query.data.data.status)
  return (
    <dialog
      ref={dialog}
      className="release-table-panel"
      aria-label="Enviar comanda a cocina"
      onCancel={(event) => {
        event.preventDefault()
        if (!operation.locked) onClose()
      }}
    >
      <h3>Enviar pedido #{orderId} a cocina</h3>
      <ErrorNotice error={query.error || operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div style={{ maxHeight: '45dvh', overflow: 'auto' }}>
          {query.data?.data.lines.map((line) => (
            <p key={line.id}>
              <strong>
                {line.quantity} × {line.name}
              </strong>
              <br />
              {line.station?.name ?? 'Sin estación: configura su ruta antes de enviar.'}
              <br />
              {preparationLabels[line.preparation_destination ?? 'table']}
            </p>
          ))}
          {!query.data?.data.lines.length && !query.error && (
            <p>No hay productos nuevos pendientes de envío.</p>
          )}
        </div>
      )}
      {operation.error && !operation.uncertain && (
        <button type="button" onClick={() => void query.refetch()}>
          Revisar datos actuales
        </button>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={operation.locked}
          onClick={onClose}
        >
          Volver
        </button>
        <button
          type="button"
          className="button primary"
          disabled={operation.isPending || (!operation.uncertain && invalid)}
          onClick={() => operation.send({ order_revision: query.data?.data.order_revision })}
        >
          {operation.uncertain ? 'Reintentar mismo envío' : 'Confirmar envío a cocina'}
        </button>
      </div>
    </dialog>
  )
}
