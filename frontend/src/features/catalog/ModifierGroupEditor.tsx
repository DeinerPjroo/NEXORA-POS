import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal, Submit } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import type { Product } from './types'
import type { ModifierGroup } from './modifier-types'
import { useModifierWrite } from './useModifierWrite'

type DraftOption = { key: string; name: string; price: string }
const newOption = (): DraftOption => ({ key: crypto.randomUUID(), name: '', price: '0' })
export function ModifierGroupEditor({
  product: initial,
  group: initialGroup,
  currency,
  onClose,
}: {
  product: Product
  group: ModifierGroup | null
  currency: string
  onClose: () => void
}) {
  const [product] = useState(initial)
  const [group] = useState(initialGroup)
  const [kind, setKind] = useState<ModifierGroup['kind']>(group?.kind ?? 'addon')
  const [options, setOptions] = useState<DraftOption[]>(() => [newOption()])
  const operation = useModifierWrite<ModifierGroup>(
    `products/${product.id}/modifier-groups${group ? `/${group.id}` : ''}`,
    !!group,
    onClose,
  )
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  function close() {
    if (conflict) void operation.refresh()
    onClose()
  }
  const valid =
    !!group ||
    options.every(
      (option) =>
        option.name.trim() &&
        /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/.test(option.price.replace(',', '.')),
    )
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
      is_active: data.get('is_active') === 'on',
      ...(!group
        ? {
            kind,
            options: options.map((option, position) => ({
              name: option.name.trim(),
              extra_price: kind === 'exclusion' ? '0' : option.price.replace(',', '.'),
              is_active: true,
              position,
            })),
          }
        : {}),
    })
  }
  return (
    <Modal
      title={group ? `Editar grupo · ${group.name}` : `Nuevo grupo · ${product.name}`}
      onClose={close}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="muted small">
          Hasta 8 grupos activos por producto y 20 opciones activas por grupo. Cada opción se elige
          una vez por unidad. Los precios admiten hasta cuatro decimales, sin separadores de miles.
        </p>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Nombre del grupo">
            <input name="name" required maxLength={80} defaultValue={group?.name} autoFocus />
          </Field>
          {!group ? (
            <Field label="Tipo de grupo">
              <select
                value={kind}
                onChange={(event) => {
                  const value = event.target.value as ModifierGroup['kind']
                  setKind(value)
                  if (value === 'exclusion')
                    setOptions(options.map((option) => ({ ...option, price: '0' })))
                }}
              >
                <option value="addon">Adicionales</option>
                <option value="exclusion">Exclusiones sin recargo</option>
              </select>
            </Field>
          ) : (
            <p className="muted small">
              {kind === 'addon' ? 'Adicionales' : 'Exclusiones sin recargo'} · El tipo se conserva.
            </p>
          )}
          <div className="form-grid">
            <Field label="Mínimo de opciones">
              <input
                type="number"
                name="min_select"
                min={0}
                max={20}
                required
                defaultValue={group?.min_select ?? 0}
              />
            </Field>
            <Field label="Máximo de opciones">
              <input
                type="number"
                name="max_select"
                min={1}
                max={20}
                required
                defaultValue={group?.max_select ?? 1}
              />
            </Field>
          </div>
          <Field label="Orden de aparición del grupo">
            <input
              type="number"
              name="position"
              min={0}
              max={999}
              required
              defaultValue={group?.position ?? 0}
            />
          </Field>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={group?.is_active ?? true} />
            <span>Grupo activo</span>
          </label>
          {!group && (
            <div className="modifier-draft-options">
              {options.map((option, index) => (
                <div className="modifier-draft-option" key={option.key}>
                  <Field label={`Nombre de opción ${index + 1}`}>
                    <input
                      value={option.name}
                      required
                      maxLength={80}
                      onChange={(event) =>
                        setOptions(
                          options.map((item) =>
                            item.key === option.key ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`Precio adicional de opción ${index + 1} (${currency})`}>
                    <input
                      inputMode="decimal"
                      value={option.price}
                      disabled={kind === 'exclusion'}
                      onChange={(event) =>
                        setOptions(
                          options.map((item) =>
                            item.key === option.key ? { ...item, price: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Retirar opción ${index + 1}`}
                    disabled={options.length === 1}
                    onClick={() => setOptions(options.filter((item) => item.key !== option.key))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={options.length >= 20}
                onClick={() => setOptions([...options, newOption()])}
              >
                <Plus size={16} />
                Agregar opción al grupo
              </button>
            </div>
          )}
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
            {operation.uncertain ? 'Reintentar grupo' : 'Guardar grupo'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
