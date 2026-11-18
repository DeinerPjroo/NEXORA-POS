import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, Modal } from '../../components/ui'
import { formatMoney } from '../../lib/money'
import { CatalogError } from '../catalog/catalog-ui'
import type { Product } from '../catalog/types'
import type { ComboConfiguration } from '../catalog/combo-types'
import type { OrderChannel } from '../catalog/context-price-types'
import { ModifierOrderPicker } from './ModifierOrderPicker'
import { makeComboLine } from './cart'
import type { CartConfiguration, CartLine } from './cart'
import { CartComboDetails } from './CartComboDetails'

export function ComboOrderPicker({
  product,
  branchId,
  channel,
  currency,
  onPick,
  onClose,
  onRefresh,
}: {
  product: Product
  branchId: number
  channel: OrderChannel
  currency: string
  onPick: (line: CartLine) => void
  onClose: () => void
  onRefresh: () => void
}) {
  const [instance] = useState(() => crypto.randomUUID())
  const [selected, setSelected] = useState<Record<string, CartConfiguration>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [customizing, setCustomizing] = useState<number | null>(null)
  const [review, setReview] = useState<CartLine | null>(null)
  const [alternatives, setAlternatives] = useState<number[]>([])
  const query = useQuery({
    queryKey: ['combo-configuration', product.id, branchId, channel, instance],
    queryFn: ({ signal }) =>
      api<ComboConfiguration>(
        `products/${product.id}/combo-configuration?branch_id=${branchId}&channel=${channel}`,
        { signal },
      ),
    gcTime: 0,
    staleTime: Infinity,
  })
  const slots = (query.data?.data ?? [])
    .filter((component) => component.combo_group_id === null || alternatives.includes(component.id))
    .flatMap((component) =>
      Array.from({ length: component.units }, (_, unit_index) => ({
        component,
        unit_index,
        key: `${component.id}:${unit_index}`,
      })),
    )
  const mutation = useMutation({
    mutationFn: () =>
      api<{ data: { items: Omit<CartLine, 'key'>[] } }>('orders/preview', {
        method: 'POST',
        body: {
          branch_id: branchId,
          channel,
          currency,
          items: [
            {
              kind: 'combo',
              selection_version: query.data?.selection_version,
              product_id: product.id,
              quantity: 1,
              notes: '',
              components: slots.map((slot) => ({
                component_id: slot.component.id,
                unit_index: slot.unit_index,
                notes: notes[slot.key] ?? '',
                modifiers: selected[slot.key]?.selections ?? [],
              })),
            },
          ],
        },
      }),
    onSuccess: ({ data }) => {
      const line = data.items[0]
      line.components = line.components?.map((part) => ({
        ...part,
        notes: notes[`${part.component_id}:${part.unit_index}`] ?? '',
      }))
      setReview(makeComboLine(line))
    },
  })
  const current = query.data?.product_revision === product.revision
  const ready =
    current &&
    query.data?.combo_context.ready &&
    slots.length > 0 &&
    slots.length <= 20 &&
    query.data.groups.every((group) => {
      const count = query.data.data.filter(
        (part) => part.combo_group_id === group.id && alternatives.includes(part.id),
      ).length
      return count >= group.min_select && count <= group.max_select
    }) &&
    slots.every((slot) => slot.component.selection_context?.allowed !== false) &&
    slots.every((slot) => !slot.component.product?.modifier_groups_count || !!selected[slot.key])
  const slot = customizing !== null ? slots[customizing] : null
  return (
    <Modal title={`Configura el combo · ${product.name}`} onClose={onClose}>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <div className="form-stack">
          <p>
            Base del combo: {formatMoney(query.data.price_context.amount, currency)}. Los
            adicionales elegidos se suman a la parte del componente.
          </p>
          {!current && (
            <p className="notice">El combo cambió. Actualiza el catálogo antes de configurarlo.</p>
          )}
          {query.data.combo_context.reason && (
            <p className="notice">{query.data.combo_context.reason}</p>
          )}
          <ErrorNotice error={mutation.error} />
          {!review ? (
            <>
              <fieldset disabled={mutation.isPending || !current} className="form-stack">
                {query.data.groups.map((group) => {
                  const options = query.data.data.filter((part) => part.combo_group_id === group.id)
                  const count = options.filter((part) => alternatives.includes(part.id)).length
                  return (
                    <section
                      className="form-stack"
                      key={group.id}
                      aria-label={`Alternativas de ${group.name}`}
                    >
                      <strong>{group.name}</strong>
                      <p className="muted small">
                        Elegir {group.min_select}–{group.max_select} alternativas · {count}{' '}
                        elegidas. Cada alternativa incluye todas sus unidades.
                      </p>
                      {options.map((part) => (
                        <label className="checkbox-line" key={part.id}>
                          <input
                            type="checkbox"
                            checked={alternatives.includes(part.id)}
                            disabled={
                              part.selection_context?.allowed === false ||
                              (!alternatives.includes(part.id) && count >= group.max_select)
                            }
                            onChange={(event) =>
                              setAlternatives(
                                event.target.checked
                                  ? [...alternatives, part.id]
                                  : alternatives.filter((id) => id !== part.id),
                              )
                            }
                          />
                          <span>
                            {part.product?.name}
                            {part.variant ? ` · ${part.variant.name}` : ''} · {part.units} unidades
                            {part.selection_context?.reason
                              ? ` · ${part.selection_context.reason}`
                              : ''}
                          </span>
                        </label>
                      ))}
                    </section>
                  )
                })}
                <p aria-live="polite">{slots.length} de 20 unidades elegidas por combo.</p>
                {slots.map((slot, index) => (
                  <div className="cart-line combo-composition" key={slot.key}>
                    <strong>
                      {index + 1}. {slot.component.product?.name}
                      {slot.component.variant ? ` · ${slot.component.variant.name}` : ''}
                    </strong>
                    {!!slot.component.product?.modifier_groups_count && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setCustomizing(index)}
                      >
                        {selected[slot.key] ? 'Cambiar preparación' : 'Elegir preparación'} ·{' '}
                        {index + 1}
                      </button>
                    )}
                    <input
                      aria-label={`Observación del componente ${index + 1}`}
                      maxLength={300}
                      placeholder="Observación de preparación…"
                      value={notes[slot.key] ?? ''}
                      onChange={(event) => setNotes({ ...notes, [slot.key]: event.target.value })}
                    />
                  </div>
                ))}
              </fieldset>
              <p className="muted small">
                Se comprobarán precios, impuestos y horarios actuales de todos los componentes antes
                de agregarlo.
              </p>
              <div className="combo-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={mutation.isPending}
                  onClick={onRefresh}
                >
                  Actualizar catálogo
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!ready || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? 'Revisando…' : 'Revisar precio del combo'}
                </button>
              </div>
            </>
          ) : (
            <>
              <CartComboDetails line={review} currency={currency} />
              <p>
                Precio por unidad de combo:{' '}
                <strong>{formatMoney(review.expected_unit_price, currency)}</strong>.
              </p>
              <div className="combo-actions">
                <button type="button" className="button secondary" onClick={() => setReview(null)}>
                  Volver a preparaciones
                </button>
                <button type="button" className="button primary" onClick={() => onPick(review)}>
                  Agregar combo revisado
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {slot?.component.product && (
        <ModifierOrderPicker
          product={slot.component.product}
          variant={slot.component.variant ?? undefined}
          currency={currency}
          basePriceOverride="0"
          onClose={() => setCustomizing(null)}
          onRefresh={onRefresh}
          onPick={(configuration) => {
            setSelected({ ...selected, [slot.key]: configuration })
            setCustomizing(null)
          }}
        />
      )}
    </Modal>
  )
}
