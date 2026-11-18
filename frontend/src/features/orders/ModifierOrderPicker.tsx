import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { Loading, Modal } from '../../components/ui'
import { CatalogError } from '../catalog/catalog-ui'
import type { Product, Variant } from '../catalog/types'
import type { ModifierGroup } from '../catalog/modifier-types'
import type { CartConfiguration } from './cart'
import { contextualPrice } from './cart'

export function ModifierOrderPicker({
  product,
  variant,
  currency,
  onPick,
  onClose,
  onRefresh,
}: {
  product: Product
  variant?: Variant
  currency: string
  onPick: (configuration: CartConfiguration) => void
  onClose: () => void
  onRefresh: () => void
}) {
  const [instance] = useState(() => crypto.randomUUID())
  const [selected, setSelected] = useState<Record<number, number[]>>({})
  const query = useQuery({
    queryKey: ['modifier-configuration', product.id, instance],
    queryFn: ({ signal }) =>
      api<{ data: ModifierGroup[]; product_revision: number }>(
        `products/${product.id}/modifier-configuration`,
        { signal },
      ),
    gcTime: 0,
    staleTime: Infinity,
  })
  const groups = query.data?.data ?? []
  const basePrice = contextualPrice(product, variant)
  const extra = groups.reduce(
    (sum, group) =>
      sum +
      (group.options ?? [])
        .filter((option) => selected[group.id]?.includes(option.id))
        .reduce((subtotal, option) => subtotal + moneyUnits(option.extra_price), 0n),
    0n,
  )
  const units = moneyUnits(basePrice) + extra
  const current = query.data?.product_revision === product.revision
  const ready =
    !!query.data &&
    current &&
    units <= 9999999999999999999n &&
    groups.every((group) => {
      const count = selected[group.id]?.length ?? 0
      return count >= group.min_select && count <= group.max_select
    })
  function toggle(group: ModifierGroup, id: number) {
    const previous = selected[group.id] ?? []
    if (previous.includes(id))
      setSelected({ ...selected, [group.id]: previous.filter((value) => value !== id) })
    else if (previous.length < group.max_select)
      setSelected({ ...selected, [group.id]: [...previous, id] })
  }
  function add() {
    if (!ready) return
    const chosen = groups.filter((group) => selected[group.id]?.length)
    onPick({
      unitPrice: unitsToMoney(units),
      selections: chosen.map((group) => ({ group_id: group.id, option_ids: selected[group.id] })),
      snapshot: chosen.map((group) => ({
        group_id: group.id,
        group_name: group.name,
        kind: group.kind,
        group_revision: group.revision,
        options: (group.options ?? [])
          .filter((option) => selected[group.id].includes(option.id))
          .map((option) => ({ id: option.id, name: option.name, extra_price: option.extra_price })),
      })),
    })
  }
  return (
    <Modal
      title={`Personaliza · ${product.name}${variant ? ` · ${variant.name}` : ''}`}
      onClose={onClose}
    >
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <div className="form-stack">
          <p className="muted small">
            Elige las opciones por unidad. Los adicionales se suman al precio base de{' '}
            {formatMoney(basePrice, currency)}.
          </p>
          {!current && (
            <div className="notice">
              El producto cambió. Actualiza el catálogo antes de elegir.
              <button type="button" className="text-button" onClick={onRefresh}>
                Actualizar catálogo
              </button>
            </div>
          )}
          {groups.map((group) => (
            <fieldset className="modifier-choice-group" key={group.id} disabled={!current}>
              <legend>{group.name}</legend>
              <p className="muted small">
                {group.min_select ? `Elige al menos ${group.min_select}` : 'Opcional'} · Hasta{' '}
                {group.max_select} · Elegidas {selected[group.id]?.length ?? 0}
              </p>
              {(group.options ?? []).map((option) => {
                const checked = selected[group.id]?.includes(option.id) ?? false
                return (
                  <label className="modifier-choice-option" key={option.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && (selected[group.id]?.length ?? 0) >= group.max_select}
                      onChange={() => toggle(group, option.id)}
                    />
                    <span>{option.name}</span>
                    <b>
                      {group.kind === 'exclusion' || moneyUnits(option.extra_price) === 0n
                        ? 'Sin recargo'
                        : `+ ${formatMoney(option.extra_price, currency)}`}
                    </b>
                  </label>
                )
              })}
            </fieldset>
          ))}
          <div className="checkout-change">
            <span>Precio por unidad con opciones</span>
            <strong>{formatMoney(unitsToMoney(units), currency)}</strong>
          </div>
          {units > 9999999999999999999n && (
            <p className="notice">El precio combinado excede el importe permitido.</p>
          )}
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              Volver
            </button>
            <button type="button" className="button primary" disabled={!ready} onClick={add}>
              Agregar con estas opciones
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
