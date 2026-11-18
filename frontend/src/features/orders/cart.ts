import { moneyUnits, unitsToMoney } from '../../lib/money'
import type { Product, Variant } from '../catalog/types'
import type { ModifierSelection, ModifierSnapshot } from '../catalog/modifier-types'

export type CartConfiguration = {
  selections: ModifierSelection[]
  snapshot: ModifierSnapshot[]
  unitPrice: string
}

export type CartLine = {
  expected_tax_revision?: number
  key: string
  product_id: number
  variant_id: number | null
  product_name: string
  variant_name: string | null
  quantity: number
  product_revision: number
  expected_unit_price: string
  notes: string
  modifiers?: ModifierSelection[]
  modifier_labels?: ModifierSnapshot[]
}
export function makeLine(
  product: Product,
  variant?: Variant,
  configuration?: CartConfiguration,
): CartLine {
  const signature =
    configuration?.selections
      .filter((selection) => selection.option_ids.length)
      .slice()
      .sort((a, b) => a.group_id - b.group_id)
      .map(
        (selection) =>
          `${selection.group_id}=${[...selection.option_ids].sort((a, b) => a - b).join(',')}`,
      )
      .join('|') ?? ''
  return {
    key: `${product.id}:${variant?.id ?? ''}${signature ? `:${signature}` : ''}`,
    product_id: product.id,
    variant_id: variant?.id ?? null,
    product_name: product.name,
    variant_name: variant?.name ?? null,
    quantity: 1,
    product_revision: product.revision,
    ...(product.tax_profile ? { expected_tax_revision: product.tax_profile.revision } : {}),
    expected_unit_price: configuration?.unitPrice ?? variant?.sale_price ?? product.sale_price,
    ...(configuration
      ? { modifiers: configuration.selections, modifier_labels: configuration.snapshot }
      : {}),
    notes: '',
  }
}
export function cartSubtotal(lines: CartLine[]): string {
  return unitsToMoney(
    lines.reduce(
      (sum, line) => sum + moneyUnits(line.expected_unit_price) * BigInt(line.quantity),
      0n,
    ),
  )
}
