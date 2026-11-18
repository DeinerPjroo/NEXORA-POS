import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal, Submit } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import type { Product } from './types'
import type { ModifierGroup, ModifierOption } from './modifier-types'
import { useModifierWrite } from './useModifierWrite'

export function ModifierOptionEditor({
  product: initial,
  group,
  option,
  currency,
  onClose,
}: {
  product: Product
  group: ModifierGroup
  option: ModifierOption | null
  currency: string
  onClose: () => void
}) {
  const [product] = useState(initial)
  const [price, setPrice] = useState(option?.extra_price ?? '0')
  const operation = useModifierWrite<ModifierOption>(
    `products/${product.id}/modifier-groups/${group.id}/options${option ? `/${option.id}` : ''}`,
    !!option,
    onClose,
  )
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  function close() {
    if (conflict) void operation.refresh()
    onClose()
  }
  const normalized = group.kind === 'exclusion' ? '0' : price.replace(',', '.')
  const valid = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/.test(normalized)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!valid) return
    const data = new FormData(event.currentTarget)
    operation.send({
      ...Object.fromEntries(data),
      product_revision: product.revision,
      currency,
      extra_price: normalized,
      is_active: data.get('is_active') === 'on',
    })
  }
  return (
    <Modal
      title={option ? `Editar opción · ${option.name}` : `Nueva opción · ${group.name}`}
      onClose={close}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Nombre de la opción">
            <input name="name" required maxLength={80} defaultValue={option?.name} autoFocus />
          </Field>
          <Field label={`Precio adicional (${currency})`}>
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={group.kind === 'exclusion'}
              inputMode="decimal"
            />
          </Field>
          <p className="muted small">
            {group.kind === 'exclusion'
              ? 'Las exclusiones no agregan ni descuentan dinero.'
              : 'Importe por unidad de producto, con hasta cuatro decimales y sin separadores de miles.'}
          </p>
          <Field label="Orden de aparición de la opción">
            <input
              type="number"
              name="position"
              min={0}
              max={999}
              required
              defaultValue={option?.position ?? 0}
            />
          </Field>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={option?.is_active ?? true} />
            <span>Opción activa</span>
          </label>
          <p className="muted small">
            Archivar conserva los pedidos anteriores. Un grupo activo debe mantener suficientes
            opciones para cumplir su mínimo.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">
            Cierra este formulario y vuelve a abrirlo desde la ficha actualizada.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            {conflict ? 'Cerrar y actualizar ficha' : 'Volver'}
          </button>
          <Submit
            pending={operation.isPending}
            disabled={!operation.uncertain && (!valid || conflict)}
          >
            {operation.uncertain ? 'Reintentar opción' : 'Guardar opción'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
