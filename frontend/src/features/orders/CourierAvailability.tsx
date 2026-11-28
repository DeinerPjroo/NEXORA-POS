import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'

export type Courier = {
  id: number
  name: string
  availability: { available: boolean; revision: number; updated_at: string } | null
}
export function courierAvailabilityLabel(courier: Courier) {
  return !courier.availability
    ? 'Sin disponibilidad declarada'
    : courier.availability.available
      ? 'Disponible'
      : 'No disponible'
}

export function CourierAvailability({
  branchId,
  onClose,
}: {
  branchId: number
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Courier | null>(null)
  const couriers = useQuery({
    queryKey: ['couriers', branchId],
    queryFn: () => api<{ data: Courier[] }>(`deliveries/couriers?branch_id=${branchId}`),
  })
  return (
    <Modal title="Disponibilidad de repartidores" locked={!!selected} onClose={onClose}>
      <p>
        Disponibilidad declarada para esta sucursal. No representa ubicación ni conexión en vivo.
      </p>
      <ErrorNotice error={couriers.error} />
      {couriers.isPending && <Loading />}
      {!selected && (
        <div className="form-stack">
          {couriers.data?.data.map((courier) => (
            <button key={courier.id} onClick={() => setSelected(structuredClone(courier))}>
              <strong>{courier.name}</strong> · {courierAvailabilityLabel(courier)}
            </button>
          ))}
          {couriers.data?.data.length === 0 && (
            <p>No hay empleados autorizados para repartir en esta sucursal.</p>
          )}
        </div>
      )}
      {selected && (
        <AvailabilityEditor
          branchId={branchId}
          courier={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Modal>
  )
}

function AvailabilityEditor({
  branchId,
  courier,
  onClose,
}: {
  branchId: number
  courier: Courier
  onClose: () => void
}) {
  const client = useQueryClient()
  const [available, setAvailable] = useState(courier.availability?.available ?? true)
  const [reason, setReason] = useState('')
  const operation = useOperation(`deliveries/couriers/${courier.id}/availability`, async () => {
    await client.invalidateQueries({ queryKey: ['couriers', branchId] })
    onClose()
  })
  return (
    <div className="form-stack">
      <strong>{courier.name}</strong>
      <Field label="Disponibilidad declarada">
        <select
          disabled={operation.locked}
          value={available ? 'yes' : 'no'}
          onChange={(event) => setAvailable(event.target.value === 'yes')}
        >
          <option value="yes">Disponible</option>
          <option value="no">No disponible</option>
        </select>
      </Field>
      <Field label="Motivo de disponibilidad">
        <textarea
          value={reason}
          minLength={3}
          maxLength={250}
          disabled={operation.locked}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="form-actions">
        <button disabled={operation.locked} onClick={onClose}>
          Volver a repartidores
        </button>
        <button
          className="button primary"
          disabled={operation.isPending || (!operation.uncertain && reason.trim().length < 3)}
          onClick={() =>
            operation.send({
              branch_id: branchId,
              revision: courier.availability?.revision ?? 0,
              available,
              reason: reason.trim(),
            })
          }
        >
          {operation.uncertain ? 'Reintentar misma disponibilidad' : 'Guardar disponibilidad'}
        </button>
      </div>
    </div>
  )
}
