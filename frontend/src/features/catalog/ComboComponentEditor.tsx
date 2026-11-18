import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, Submit, useToast } from '../../components/ui'
import { useSession } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { CatalogError, Pagination } from './catalog-ui'
import { ComboProductPicker } from './ComboProductPicker'
import type { ComboComponent } from './combo-types'
import type { CatalogPage, Product, Variant } from './types'

export function useComboWrite<T>(path: string, editing: boolean, close: () => void) {
  const client = useQueryClient()
  const toast = useToast()
  const refresh = () =>
    Promise.all(
      ['product', 'products', 'combo-components', 'combo-groups', 'combo-configuration'].map(
        (key) => client.invalidateQueries({ queryKey: [key] }),
      ),
    )
  const operation = useOperation<T>(
    path,
    async () => {
      await refresh()
      toast('Configuración del combo guardada.')
      close()
    },
    editing ? 'PUT' : 'POST',
  )
  return { ...operation, refresh }
}

function ComponentVariantPicker({
  product,
  onPick,
  selected,
}: {
  product: Product
  onPick: (variant: Variant) => void
  selected: Variant | null
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['variants', 'combo-component', product.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<Variant> & { product_revision: number }>(
        `products/${product.id}/variants?status=active&page=${page}&per_page=10`,
        { signal },
      ),
    staleTime: 0,
  })
  return query.error ? (
    <CatalogError error={query.error} onRetry={() => void query.refetch()} />
  ) : query.isPending ? (
    <Loading />
  ) : (
    <>
      {query.data.product_revision !== product.revision && (
        <p className="notice">
          El producto cambió. Vuelve a elegirlo antes de seleccionar presentación.
        </p>
      )}
      <div className="order-variant-options">
        {query.data.data.map((variant) => (
          <button
            type="button"
            className="order-variant-option"
            key={variant.id}
            disabled={query.data.product_revision !== product.revision}
            onClick={() => onPick(variant)}
            aria-pressed={selected?.id === variant.id}
          >
            <strong>{variant.name}</strong>
            <span>{selected?.id === variant.id ? 'Elegida' : 'Elegir'}</span>
          </button>
        ))}
      </div>
      <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
    </>
  )
}

export function ComboComponentEditor({
  product,
  component,
  group,
  onClose,
}: {
  product: Product
  component: ComboComponent | null
  group?: { id: number; name: string } | null
  onClose: () => void
}) {
  const { session } = useSession()
  const [snapshot] = useState({ revision: product.revision, currency: session!.company.currency })
  const [leaf, setLeaf] = useState<Product | null>(null)
  const [variant, setVariant] = useState<Variant | null>(null)
  const [picking, setPicking] = useState(false)
  const operation = useComboWrite<ComboComponent>(
    `products/${product.id}/combo-components${component ? `/${component.id}` : ''}`,
    !!component,
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
      units: Number(data.get('units')),
      position: Number(data.get('position')),
      is_active: data.get('is_active') === 'on',
      ...(component
        ? { revision: component.revision }
        : {
            component_product_id: leaf?.id,
            component_product_revision: leaf?.revision,
            component_variant_id: variant?.id ?? null,
            combo_group_id: group?.id ?? null,
          }),
    })
  }
  return (
    <Modal
      title={`${component ? 'Editar componente' : 'Nuevo componente'} · ${product.name}`}
      onClose={close}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <p>
            {group
              ? `Alternativa de ${group.name}`
              : component?.combo_group_id
                ? `Alternativa del grupo #${component.combo_group_id}`
                : 'Componente fijo obligatorio'}
          </p>
          {component ? (
            <p>
              {component.product?.name}
              {component.variant ? ` · ${component.variant.name}` : ''}. Para elegir otro producto,
              archiva este componente y crea otro.
            </p>
          ) : (
            <>
              <button type="button" className="button secondary" onClick={() => setPicking(true)}>
                {leaf ? `Cambiar ${leaf.name}` : 'Elegir producto individual'}
              </button>
              {leaf && (
                <p>
                  <strong>{leaf.name}</strong> · {leaf.sku}
                </p>
              )}
              {!!leaf?.variants_count && (
                <ComponentVariantPicker product={leaf} selected={variant} onPick={setVariant} />
              )}
            </>
          )}
          <Field label="Unidades por combo">
            <input
              type="number"
              name="units"
              required
              min={1}
              max={20}
              defaultValue={component?.units ?? 1}
            />
          </Field>
          <Field label="Orden del componente">
            <input
              type="number"
              name="position"
              required
              min={0}
              max={999}
              defaultValue={component?.position ?? 0}
            />
          </Field>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={component?.is_active ?? true} />
            <span>Componente activo</span>
          </label>
          <p className="muted small">
            Hasta 20 unidades elegidas por combo. Elegir una alternativa incluye todas sus unidades.
            Cada unidad permite elegir su preparación al tomar el pedido; los adicionales se cobran
            aparte de la base repartida.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">La configuración cambió. Cierra y abre con la ficha actualizada.</p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cerrar
          </button>
          <Submit
            pending={operation.isPending}
            disabled={
              !operation.uncertain &&
              (conflict || (!component && (!leaf || (leaf.variants_count > 0 && !variant))))
            }
          >
            {operation.uncertain ? 'Reintentar componente' : 'Guardar componente'}
          </Submit>
        </div>
      </form>
      {picking && (
        <ComboProductPicker
          onClose={() => setPicking(false)}
          onPick={(value) => {
            setLeaf(value)
            setVariant(null)
            setPicking(false)
          }}
        />
      )}
    </Modal>
  )
}
