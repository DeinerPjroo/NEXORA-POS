import type { FormEvent } from 'react'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import type { Product, Variant } from './types'

export function VariantEditor({
  product,
  variant,
  onClose,
}: {
  product: Product
  variant: Variant | null
  onClose: () => void
}) {
  const can = useCan()
  const { session } = useSession()
  const [expectedRevision] = useState(product.revision)
  const [expectedCurrency] = useState(session!.company.currency)
  const client = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`products/${product.id}/variants${variant ? `/${variant.id}` : ''}`, {
        method: variant ? 'PUT' : 'POST',
        body,
      }),
    onSuccess: async () => {
      await Promise.all(
        ['product', 'products', 'variants'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      toast(variant ? 'Variante actualizada.' : 'Variante creada.')
      onClose()
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const data = Object.fromEntries(form)
    data.sale_price = String(data.sale_price).replace(',', '.')
    if (can('catalog.costs')) data.cost_price = String(data.cost_price).replace(',', '.')
    mutation.mutate({
      ...data,
      currency: expectedCurrency,
      product_revision: expectedRevision,
      is_active: form.get('is_active') === 'on',
      is_available: form.get('is_available') === 'on',
    })
  }
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409
  return (
    <Modal
      title={variant ? `Editar variante: ${variant.name}` : 'Una presentación para tu producto'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          {product.name} · Cada presentación tiene sus propios códigos, precio y disponibilidad.
        </p>
        <ErrorNotice error={mutation.error} />
        <Field label="Nombre de la variante">
          <input
            name="name"
            required
            maxLength={80}
            autoFocus
            defaultValue={variant?.name}
            placeholder="Ej. Grande · 8 porciones"
          />
        </Field>
        <div className="form-grid">
          <Field label="SKU de la variante">
            <input
              name="sku"
              required
              maxLength={40}
              pattern="[A-Za-z0-9_-]+"
              defaultValue={variant?.sku}
              placeholder="PIZZA-GRANDE"
            />
          </Field>
          <Field label="Código de barras de la variante">
            <input
              name="barcode"
              maxLength={64}
              pattern="[A-Za-z0-9_-]+"
              defaultValue={variant?.barcode ?? ''}
              placeholder="Opcional"
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field
            label={`Precio de la variante (${session!.company.currency})`}
            hint="Sin separadores de miles. Hasta 4 decimales."
          >
            <input
              name="sale_price"
              inputMode="decimal"
              required
              pattern="[0-9]+([.,][0-9]{1,4})?"
              maxLength={20}
              defaultValue={variant?.sale_price ?? product.sale_price}
            />
          </Field>
          {can('catalog.costs') && (
            <Field label={`Costo de la variante (${session!.company.currency})`}>
              <input
                name="cost_price"
                inputMode="decimal"
                required
                pattern="[0-9]+([.,][0-9]{1,4})?"
                maxLength={20}
                defaultValue={variant?.cost_price ?? product.cost_price ?? '0'}
              />
            </Field>
          )}
        </div>
        <div className="product-state-controls">
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={variant?.is_active ?? true} />
            <span>Variante activa</span>
          </label>
          <label className="checkbox-line">
            <input
              name="is_available"
              type="checkbox"
              defaultChecked={variant?.is_available ?? true}
            />
            <span>Variante disponible</span>
          </label>
        </div>
        <p className="muted small">
          Desactivar conserva su información. El producto y la categoría también deben estar activos
          para habilitar pedidos.
        </p>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {conflict ? 'Cerrar y actualizar' : 'Cancelar'}
          </button>
          <Submit pending={mutation.isPending} disabled={conflict}>
            Guardar variante
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
