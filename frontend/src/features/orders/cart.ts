import { moneyUnits, unitsToMoney } from '../../lib/money'
import type { Product, Variant } from '../catalog/types'

export type CartLine = {
  key: string
  product_id: number
  variant_id: number | null
  product_name: string
  variant_name: string | null
  quantity: number
  product_revision: number
  expected_unit_price: string
  notes: string
}
export function makeLine(product: Product, variant?: Variant): CartLine {
  return {
    key: `${product.id}:${variant?.id ?? ''}`,
    product_id: product.id,
    variant_id: variant?.id ?? null,
    product_name: product.name,
    variant_name: variant?.name ?? null,
    quantity: 1,
    product_revision: product.revision,
    expected_unit_price: variant?.sale_price ?? product.sale_price,
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
