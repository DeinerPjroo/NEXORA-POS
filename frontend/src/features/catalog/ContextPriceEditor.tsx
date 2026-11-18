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
import type { ContextPrice } from './context-price-types'
import type { Product, Variant } from './types'

export function ContextPriceEditor({
  product,
  variant,
  price,
  onClose,
}: {
  product: Product
  variant?: Variant
  price: ContextPrice | null
  onClose: () => void
}) {
  const { session } = useSession()
  const [currency] = useState(session!.company.currency)
  const [productRevision] = useState(product.revision)
  const [branch, setBranch] = useState(price?.branch_id ? String(price.branch_id) : '')
  const [channel, setChannel] = useState<ContextPrice['channel']>(price?.channel ?? 'all')
  const context = useOperationContext()
  const client = useQueryClient()
  const toast = useToast()
  const refresh = () =>
    Promise.all(
      ['product', 'products', 'variants', 'context-prices', 'modifier-configuration'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
  const operation = useOperation<ContextPrice>(
    `products/${product.id}/context-prices${price ? `/${price.id}` : ''}`,
    async () => {
      await refresh()
      toast('Precio por contexto guardado.')
      onClose()
    },
    price ? 'PUT' : 'POST',
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
      product_revision: productRevision,
      currency,
      amount: String(data.get('amount')).replace(',', '.'),
      is_active: data.get('is_active') === 'on',
      ...(price
        ? { revision: price.revision }
        : { variant_id: variant?.id ?? null, branch_id: branch ? Number(branch) : null, channel }),
    })
  }
  return (
    <Modal
      title={`${price ? 'Editar precio' : 'Nuevo precio'} · ${variant?.name ?? product.name}`}
      onClose={close}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="muted small">
          Prioridad: sucursal y canal, sucursal, canal y finalmente precio base. La regla no cambia
          el precio base del catálogo.
        </p>
        <ErrorNotice error={context.error} />
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Sucursal de la regla">
            <select
              value={branch}
              disabled={!!price}
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
          <Field label="Canal de la regla">
            <select
              value={channel}
              disabled={!!price}
              onChange={(event) => setChannel(event.target.value as ContextPrice['channel'])}
            >
              {Object.entries(channelLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {!branch && channel === 'all' && (
            <p className="notice">
              Elige una sucursal o un canal específico. El importe general se edita como precio
              base.
            </p>
          )}
          <Field label={`Importe del precio (${currency})`}>
            <input
              name="amount"
              inputMode="decimal"
              required
              pattern="(?:0|[1-9][0-9]{0,14})(?:[.,][0-9]{1,4})?"
              defaultValue={price?.amount ?? ''}
            />
          </Field>
          <p className="muted small">
            Hasta cuatro decimales, sin separadores de miles. El importe es anterior a los
            adicionales.
          </p>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={price?.is_active ?? true} />
            <span>Regla activa</span>
          </label>
        </fieldset>
        {conflict && (
          <p className="notice">
            La ficha cambió. Cierra y abre de nuevo para editar con la revisión actual.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cerrar
          </button>
          <Submit
            pending={operation.isPending}
            disabled={
              !operation.uncertain && (conflict || (!branch && channel === 'all') || !context.data)
            }
          >
            {operation.uncertain ? 'Reintentar precio' : 'Guardar precio'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
