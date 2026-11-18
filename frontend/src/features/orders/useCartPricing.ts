import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { OrderChannel } from '../catalog/context-price-types'
import type { CartLine } from './cart'
import { serializeCart } from './cart'

export type CartContext = { branchId: number; channel: OrderChannel }
type PreviewLine = Omit<CartLine, 'key'>
type Preview = {
  branch_id: number
  branch_name: string
  channel: OrderChannel
  items: PreviewLine[]
}
export type CartReview = {
  before: CartLine[]
  after: CartLine[]
  preview: Preview
  target: CartContext
}

function visibleConfiguration(line: CartLine): string {
  return JSON.stringify({
    price: line.expected_unit_price,
    product: line.product_name,
    variant: line.variant_name,
    allocation_mode: line.allocation_mode,
    components: line.components?.map((part) => ({
      component_id: part.component_id,
      unit_index: part.unit_index,
      configuration: visibleConfiguration({ ...part, key: '', quantity: 1 }),
    })),
    tax: line.tax_snapshot ?? null,
    groups: (line.modifier_labels ?? [])
      .map(({ group_id, group_name, kind, options }) => ({
        group_id,
        group_name,
        kind,
        options: [...options].sort((a, b) => a.id - b.id),
      }))
      .sort((a, b) => a.group_id - b.group_id),
  })
}
export function useCartPricing({
  cart,
  currency,
  locked,
  onApply,
}: {
  cart: CartLine[]
  currency: string
  locked: boolean
  onApply: (lines: CartLine[], context: CartContext) => void
}) {
  const [review, setReview] = useState<CartReview | null>(null)
  const mutation = useMutation({
    mutationFn: ({ target, lines }: { target: CartContext; lines: CartLine[] }) =>
      api<{ data: Preview }>('orders/preview', {
        method: 'POST',
        body: {
          branch_id: target.branchId,
          channel: target.channel,
          currency,
          items: serializeCart(lines, false),
        },
      }),
    onSuccess: ({ data }, { target, lines }) => {
      const after = data.items.map((line, index) => ({
        ...line,
        key: lines[index].key,
        notes: lines[index].notes,
        ...(line.components
          ? {
              components: line.components.map((part) => ({
                ...part,
                notes:
                  lines[index].components?.find(
                    (old) =>
                      old.component_id === part.component_id && old.unit_index === part.unit_index,
                  )?.notes ?? part.notes,
              })),
            }
          : {}),
      }))
      if (
        lines.some(
          (line, index) => visibleConfiguration(line) !== visibleConfiguration(after[index]),
        )
      )
        setReview({ before: lines, after, target, preview: data })
      else onApply(after, target)
    },
  })
  function request(target: CartContext) {
    if (locked || mutation.isPending || review) return
    mutation.reset()
    if (!cart.length) onApply(cart, target)
    else mutation.mutate({ target, lines: cart })
  }
  return {
    request,
    review,
    error: mutation.error,
    locked: mutation.isPending || !!review,
    pending: mutation.isPending,
    cancel: () => {
      setReview(null)
      mutation.reset()
    },
    accept: () => {
      if (!review || locked) return
      onApply(review.after, review.target)
      setReview(null)
      mutation.reset()
    },
  }
}
