import { moneyUnits, unitsToMoney } from '../../lib/money'
import type { Product, Variant } from '../catalog/types'
import type { ModifierSelection, ModifierSnapshot } from '../catalog/modifier-types'
import type { PriceContext } from '../catalog/context-price-types'

export type CartConfiguration = {
  selections: ModifierSelection[]
  snapshot: ModifierSnapshot[]
  unitPrice: string
}

export type CartLine = {
  expected_tax_revision?: number | null
  tax_snapshot?: import('../sales/tax-types').TaxSnapshot
  price_context?: PriceContext | null
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
    tax_snapshot: product.tax_profile
      ? {
          profile_id: product.tax_profile.id,
          name: product.tax_profile.name,
          price_mode: product.tax_profile.price_mode,
          rates: product.tax_profile.rates,
          revision: product.tax_profile.revision,
        }
      : { profile_id: null, name: null, price_mode: 'none', rates: [], revision: null },
    expected_unit_price: configuration?.unitPrice ?? contextualPrice(product, variant),
    price_context: variant ? variant.price_context : product.price_context,
    ...(configuration
      ? { modifiers: configuration.selections, modifier_labels: configuration.snapshot }
      : {}),
    notes: '',
  }
}
export function contextualPrice(product: Product, variant?: Variant): string {
  const entity = variant ?? product
  return entity.price_context?.amount ?? entity.sale_price
}
export function serializeCart(lines: CartLine[], expectations: boolean) {
  return lines.map((line) => ({
    product_id: line.product_id,
    variant_id: line.variant_id,
    quantity: line.quantity,
    notes: line.notes,
    ...(line.modifiers ? { modifiers: line.modifiers } : {}),
    ...(expectations
      ? {
          product_revision: line.product_revision,
          expected_unit_price: line.expected_unit_price,
          ...(line.expected_tax_revision != null
            ? { expected_tax_revision: line.expected_tax_revision }
            : {}),
        }
      : {}),
  }))
}
export function cartSubtotal(lines: CartLine[]): string {
  return unitsToMoney(
    lines.reduce(
      (sum, line) => sum + moneyUnits(line.expected_unit_price) * BigInt(line.quantity),
      0n,
    ),
  )
}
