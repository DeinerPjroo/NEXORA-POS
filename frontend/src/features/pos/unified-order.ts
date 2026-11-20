import type { OrderItem } from '../operations/types'
import type { CartLine } from '../orders/cart'
import { cartSubtotal } from '../orders/cart'
import { moneyUnits, unitsToMoney } from '../../lib/money'

// Modelo exclusivamente visual. Solo el carrito original se envía al servidor.
export type DisplayOrderLine = CartLine & {
  recordedItemIds: number[]
  recordedQuantity: number
  draftQuantity: number
  displaySubtotal: string
}
export function unifiedOrderLines(recorded: OrderItem[], drafts: CartLine[]): DisplayOrderLine[] {
  const rows: DisplayOrderLine[] = []
  const signature = (line: CartLine) =>
    JSON.stringify([
      line.product_id,
      line.variant_id,
      moneyUnits(line.expected_unit_price).toString(),
      line.notes,
      line.preparation_destination ?? 'table',
      line.modifier_labels ?? [],
    ])
  const find = (line: CartLine, combine: boolean) =>
    combine
      ? rows.find((row) => row.kind !== 'combo' && signature(row) === signature(line))
      : undefined
  for (const item of recorded) {
    const line: DisplayOrderLine = {
      key: 'recorded:' + item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      quantity: item.quantity,
      product_revision: 0,
      expected_unit_price: item.unit_price,
      notes: item.notes ?? '',
      preparation_destination: item.preparation_destination,
      recordedItemIds:[item.id],
      modifier_labels: item.modifiers_snapshot ?? [],
      recordedQuantity: item.quantity,
      draftQuantity: 0,
      displaySubtotal: item.line_subtotal,
      kind: item.order_combo_id ? 'combo' : 'regular',
    }
    const existing = find(line, !item.order_combo_id)
    if (existing) {
      existing.quantity += line.quantity
      existing.recordedQuantity += line.recordedQuantity
      existing.recordedItemIds.push(item.id)
      existing.displaySubtotal = unitsToMoney(
        moneyUnits(existing.displaySubtotal) + moneyUnits(line.displaySubtotal),
      )
    } else rows.push(line)
  }
  for (const draft of drafts) {
    const subtotal = cartSubtotal([draft])
    const existing = find(draft, draft.kind !== 'combo')
    if (existing) {
      existing.key = draft.key
      existing.quantity += draft.quantity
      existing.draftQuantity = draft.quantity
      existing.displaySubtotal = unitsToMoney(
        moneyUnits(existing.displaySubtotal) + moneyUnits(subtotal),
      )
    } else
      rows.push({
        ...draft,
        recordedQuantity: 0,
        recordedItemIds:[],
        draftQuantity: draft.quantity,
        displaySubtotal: subtotal,
      })
  }
  return rows
}
export function unifiedOrderSubtotal(
  recordedSubtotal: string | undefined,
  drafts: CartLine[],
): string {
  return unitsToMoney(moneyUnits(recordedSubtotal ?? '0') + moneyUnits(cartSubtotal(drafts)))
}
