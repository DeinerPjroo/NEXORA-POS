import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CategoryPicker } from './CategoryPicker'
import { TaxProfilePicker } from '../sales/TaxProfilePicker'
import type { TaxChoice } from '../sales/tax-types'
import type { CategorySummary, Product } from './types'

export function ProductEditor({
  product,
  onClose,
}: {
  product: Product | null
  onClose: () => void
}) {
  const [category, setCategory] = useState<CategorySummary | null>(product?.category ?? null)
  const [taxProfile, setTaxProfile] = useState<TaxChoice | null>(product?.tax_profile ?? null)
  const [validation, setValidation] = useState<Error | null>(null)
  const can = useCan()
  const { session } = useSession()
  const [expectedRevision] = useState(product?.revision)
  const [expectedCurrency] = useState(session!.company.currency)
  const client = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`products${product ? `/${product.id}` : ''}`, { method: product ? 'PUT' : 'POST', body }),
    onSuccess: async () => {
      await Promise.all(
        ['products', 'product', 'variants', 'categories', 'overview'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      toast(product ? 'Producto actualizado.' : 'Producto creado.')
      onClose()
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!category) {
      setValidation(new Error('Elige una categoría antes de guardar el producto.'))
      return
    }
    setValidation(null)
    const form = new FormData(event.currentTarget)
    const data = Object.fromEntries(form)
    data.sale_price = String(data.sale_price).replace(',', '.')
    if (can('catalog.costs')) data.cost_price = String(data.cost_price).replace(',', '.')
    mutation.mutate({
      ...data,
      category_id: category.id,
      tax_profile_id: taxProfile?.id ?? null,
      ...(taxProfile ? { tax_profile_revision: taxProfile.revision } : {}),
      currency: expectedCurrency,
      is_active: form.get('is_active') === 'on',
      is_available: form.get('is_available') === 'on',
      ...(product ? { revision: expectedRevision } : {}),
    })
  }
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409
  return (
    <Modal
      title={product ? `Editar producto: ${product.name}` : 'Un nuevo sabor en tu menú'}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={validation ?? mutation.error} />
        <Field label="Nombre del producto">
          <input
            name="name"
            required
            maxLength={150}
            defaultValue={product?.name}
            autoFocus
            placeholder="Ej. Pizza Margarita"
          />
        </Field>
        <div className="form-grid">
          <Field label="Código del producto (SKU)">
            <input
              name="sku"
              required
              maxLength={40}
              pattern="[A-Za-z0-9_-]+"
              defaultValue={product?.sku}
              placeholder="PIZZA-001"
            />
          </Field>
          <Field label="Código de barras">
            <input
              name="barcode"
              maxLength={64}
              pattern="[A-Za-z0-9_-]+"
              defaultValue={product?.barcode ?? ''}
              placeholder="Opcional"
            />
          </Field>
        </div>
        <div className="field">
          <span className="field-label">Categoría</span>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>
        {category && !category.effective_active && (
          <p className="muted small">
            Esta categoría o su principal está inactiva. El producto se conservará sin quedar
            habilitado para pedidos.
          </p>
        )}
        <Field label="Descripción del producto">
          <textarea
            name="description"
            rows={3}
            maxLength={1000}
            defaultValue={product?.description ?? ''}
            placeholder="Ingredientes, preparación o detalles que lo hacen único."
          />
        </Field>
        <div className="field">
          <span className="field-label">Perfil de impuestos del producto</span>
          <TaxProfilePicker value={taxProfile} onChange={setTaxProfile} />
          <small className="muted">
            Se conserva en pedidos nuevos; las variantes heredan este perfil. Se aplica al elegir
            cálculo por producto en Ventas.
          </small>
        </div>
        <div className="form-grid">
          <Field
            label={`Precio de venta (${session!.company.currency})`}
            hint="Sin separadores de miles. Hasta 4 decimales."
          >
            <input
              name="sale_price"
              inputMode="decimal"
              required
              pattern="[0-9]+([.,][0-9]{1,4})?"
              maxLength={20}
              defaultValue={product?.sale_price}
              placeholder="28900"
            />
          </Field>
          {can('catalog.costs') && (
            <Field
              label={`Costo de referencia (${session!.company.currency})`}
              hint="La receta calculará los costos en una fase posterior."
            >
              <input
                name="cost_price"
                inputMode="decimal"
                required
                pattern="[0-9]+([.,][0-9]{1,4})?"
                maxLength={20}
                defaultValue={product?.cost_price ?? '0'}
              />
            </Field>
          )}
        </div>
        <div className="product-state-controls">
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={product?.is_active ?? true} />
            <span>Producto activo</span>
          </label>
          <label className="checkbox-line">
            <input
              name="is_available"
              type="checkbox"
              defaultChecked={product?.is_available ?? true}
            />
            <span>Disponible (no agotado)</span>
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {conflict ? 'Cerrar y actualizar' : 'Cancelar'}
          </button>
          <Submit pending={mutation.isPending} disabled={conflict} />
        </div>
      </form>
    </Modal>
  )
}
