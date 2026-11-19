import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useSession } from '../auth/SessionProvider'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import { channelLabels } from './context-price-types'
import type { Promotion } from './promotion-types'
import type { Product, Variant } from './types'

export function PromotionEditor({
  product,
  variant,
  promotion,
  onClose,
}: {
  product: Product
  variant?: Variant
  promotion: Promotion | null
  onClose: () => void
}) {
  const { session } = useSession()
  const [snapshot] = useState({
    revision: product.revision,
    currency: session!.company.currency,
    timezone: product.availability_context?.timezone ?? session!.company.timezone,
  })
  const [branch, setBranch] = useState(promotion?.branch_id ? String(promotion.branch_id) : '')
  const [channel, setChannel] = useState<Promotion['channel']>(promotion?.channel ?? 'all')
  const [kind, setKind] = useState<Promotion['discount_type']>(
    promotion?.discount_type ?? 'percentage',
  )
  const context = useOperationContext()
  const client = useQueryClient()
  const toast = useToast()
  const refresh = () =>
    Promise.all(
      ['product', 'products', 'variants', 'promotions', 'combo-configuration'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
  const operation = useOperation<Promotion>(
    `products/${product.id}/promotions${promotion ? `/${promotion.id}` : ''}`,
    async () => {
      await refresh()
      toast('Promoción guardada.')
      onClose()
    },
    promotion ? 'PUT' : 'POST',
  )
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  function close() {
    if (conflict) void refresh()
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
      name: data.get('name'),
      discount_type: kind,
      discount_value: String(data.get('discount_value')).replace(',', '.'),
      priority: Number(data.get('priority')),
      valid_from: data.get('valid_from') || null,
      valid_until: data.get('valid_until') || null,
      is_active: data.get('is_active') === 'on',
      ...(promotion
        ? { revision: promotion.revision }
        : { variant_id: variant?.id ?? null, branch_id: branch ? Number(branch) : null, channel }),
    })
  }
  return (
    <Modal
      title={`${promotion ? 'Editar promoción' : 'Nueva promoción'} · ${variant?.name ?? product.name}`}
      onClose={close}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={context.error} />
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Nombre de la promoción">
            <input name="name" required maxLength={80} defaultValue={promotion?.name ?? ''} />
          </Field>
          <Field label="Sucursal de la promoción">
            <select
              value={branch}
              disabled={!!promotion}
              onChange={(event) => setBranch(event.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {context.data?.branches.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                  {item.is_active ? '' : ' · Inactiva'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Canal de la promoción">
            <select
              value={channel}
              disabled={!!promotion}
              onChange={(event) => setChannel(event.target.value as Promotion['channel'])}
            >
              {Object.entries(channelLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de descuento promocional">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as Promotion['discount_type'])}
            >
              <option value="percentage">Porcentaje de la base</option>
              <option value="fixed">Importe fijo de la base</option>
            </select>
          </Field>
          <Field
            label={
              kind === 'percentage'
                ? 'Porcentaje promocional'
                : `Importe promocional (${snapshot.currency})`
            }
          >
            <input
              key={kind}
              name="discount_value"
              inputMode="decimal"
              required
              pattern={
                kind === 'percentage'
                  ? '(?:0|[1-9][0-9]{0,2})(?:[.,][0-9]{1,2})?'
                  : '(?:0|[1-9][0-9]{0,14})(?:[.,][0-9]{1,4})?'
              }
              defaultValue={
                promotion
                  ? promotion.discount_type === 'percentage'
                    ? promotion.discount_value.replace(/\.?0+$/, '')
                    : promotion.discount_value
                  : ''
              }
            />
          </Field>
          <Field label="Prioridad de la promoción">
            <input
              name="priority"
              type="number"
              min={0}
              max={999}
              required
              defaultValue={promotion?.priority ?? 0}
            />
          </Field>
          <Field label="Vigente desde (opcional)">
            <input name="valid_from" type="date" defaultValue={promotion?.valid_from ?? ''} />
          </Field>
          <Field label="Vigente hasta (opcional)">
            <input name="valid_until" type="date" defaultValue={promotion?.valid_until ?? ''} />
          </Field>
          <p className="muted small">
            Fechas completas en {snapshot.timezone}; el último día está incluido. Se aplica una
            promoción: contexto más específico, menor prioridad y, en empate, la más antigua. Hasta
            20 activas por producto entre sus presentaciones.
          </p>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={promotion?.is_active ?? true} />
            <span>Promoción activa</span>
          </label>
          <p className="muted small">
            Descuenta la base contextual antes de adicionales, hasta agotarla. El porcentaje llega a
            100 y usa hasta dos decimales; el fijo hasta cuatro. El descuento se redondea a cuatro
            decimales antes de restarlo. En combos afecta la base de la raíz una vez. El descuento
            manual de venta puede aplicarse después con su permiso y motivo.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">
            La ficha o la zona cambiaron. Cierra y vuelve a abrir la promoción actualizada.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cerrar
          </button>
          <Submit
            pending={operation.isPending}
            disabled={!operation.uncertain && (conflict || !context.data)}
          >
            {operation.uncertain ? 'Reintentar promoción' : 'Guardar promoción'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
