import { useState } from 'react'
import type { FormEvent } from 'react'
import { ErrorNotice, Field, Modal, Submit } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useSession } from '../auth/SessionProvider'
import { OperationNotice } from '../operations/OperationNotice'
import { useAvailabilityWrite } from './useAvailabilityWrite'
import { weekdays } from './availability-types'
import type { AvailabilityWindow } from './availability-types'
import type { Product } from './types'

export function AvailabilityWindowEditor({
  product,
  window,
  onClose,
}: {
  product: Product
  window: AvailabilityWindow | null
  onClose: () => void
}) {
  const { session } = useSession()
  const [snapshot] = useState({
    revision: product.revision,
    currency: session!.company.currency,
    timezone: product.availability_context?.timezone ?? session!.company.timezone,
  })
  const operation = useAvailabilityWrite<AvailabilityWindow>(
    `products/${product.id}/availability-windows${window ? `/${window.id}` : ''}`,
    !!window,
    onClose,
  )
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  function close() {
    if (conflict) void operation.refresh()
    onClose()
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const data = new FormData(event.currentTarget)
    operation.send({
      product_revision: snapshot.revision,
      currency: snapshot.currency,
      expected_timezone: snapshot.timezone,
      ...(window ? { revision: window.revision } : {}),
      name: data.get('name'),
      weekday: Number(data.get('weekday')),
      start_time: data.get('start_time'),
      end_time: data.get('end_time'),
      ends_next_day: data.get('ends_next_day') === 'on',
      valid_from: data.get('valid_from') || null,
      valid_until: data.get('valid_until') || null,
      is_active: data.get('is_active') === 'on',
    })
  }
  return (
    <Modal
      title={`${window ? 'Editar ventana' : 'Nueva ventana'} · ${product.name}`}
      onClose={close}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="muted small">
          Zona: {snapshot.timezone}. El inicio se incluye y el final se excluye. Las presentaciones
          heredan este horario.
        </p>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Nombre de la ventana">
            <input name="name" maxLength={80} required defaultValue={window?.name} autoFocus />
          </Field>
          <Field label="Día de inicio">
            <select name="weekday" defaultValue={window?.weekday ?? 1}>
              {weekdays.map((day, index) => (
                <option value={index + 1} key={day}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Hora inicial">
              <input
                name="start_time"
                type="time"
                step={60}
                required
                defaultValue={window?.start_time ?? '08:00'}
              />
            </Field>
            <Field label="Hora final">
              <input
                name="end_time"
                type="time"
                step={60}
                required
                defaultValue={window?.end_time ?? '17:00'}
              />
            </Field>
          </div>
          <label className="checkbox-line">
            <input
              type="checkbox"
              name="ends_next_day"
              defaultChecked={window?.ends_next_day ?? false}
            />
            <span>Termina al día siguiente</span>
          </label>
          <p className="muted small">
            Si cruza medianoche, la hora final debe ser menor o igual a la inicial. Horas iguales y
            «día siguiente» representan un día local completo; su duración real puede variar al
            cambiar la hora estacional.
          </p>
          <div className="form-grid">
            <Field label="Vigente desde">
              <input type="date" name="valid_from" defaultValue={window?.valid_from ?? ''} />
            </Field>
            <Field label="Vigente hasta">
              <input type="date" name="valid_until" defaultValue={window?.valid_until ?? ''} />
            </Field>
          </div>
          <p className="muted small">
            Fechas opcionales del día de inicio. Una ventana de la última noche válida puede
            terminar a la madrugada siguiente.
          </p>
          <label className="checkbox-line">
            <input type="checkbox" name="is_active" defaultChecked={window?.is_active ?? true} />
            <span>Ventana activa</span>
          </label>
          <p className="muted small">
            Archivar la última ventana activa deja el producto fuera de horario mientras el horario
            esté habilitado.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">
            La configuración cambió. Cierra y abre el formulario desde la ficha actualizada.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cerrar
          </button>
          <Submit pending={operation.isPending} disabled={conflict && !operation.uncertain}>
            {operation.uncertain ? 'Reintentar ventana' : 'Guardar ventana'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
