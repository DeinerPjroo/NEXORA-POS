import type { TaxProfile } from '../sales/tax-types'
import type { PriceContext } from './context-price-types'
import type { AvailabilityContext } from './availability-types'

type CategoryBase = {
  id: number
  name: string
  color: string
  is_active: boolean
  revision: number
}
export type CategorySummary = CategoryBase & {
  parent_id: number | null
  parent: CategoryBase | null
  effective_active: boolean
}
export type Category = CategorySummary & {
  description: string | null
  products_count: number
  children_count: number
}
export function categoryPath(category: CategorySummary): string {
  return category.parent ? `${category.parent.name} / ${category.name}` : category.name
}
export type Variant = {
  price_context?: PriceContext | null
  id: number
  product_id: number
  name: string
  sku: string
  barcode: string | null
  sale_price: string
  cost_price?: string
  is_active: boolean
  is_available: boolean
}
export type Product = {
  kind?: 'regular' | 'combo'
  combo_allocation_mode?: import('./combo-types').ComboMode | null
  combo_context?: { ready: boolean; reason: string | null; expanded_units: number }
  availability_schedule_enabled?: boolean
  availability_context?: AvailabilityContext
  price_context?: PriceContext | null
  tax_profile?: TaxProfile | null
  id: number
  name: string
  sku: string
  barcode: string | null
  description: string | null
  category_id: number
  category: CategorySummary
  sale_price: string
  cost_price?: string
  is_active: boolean
  is_available: boolean
  sellable: boolean
  image_url: string | null
  variants_count: number
  available_variants_count: number
  modifier_groups_count: number
  revision: number
}
export function productStatus(product: Product) {
  if (!product.is_active) return 'Inactivo'
  if (!product.category.is_active) return 'Categoría inactiva'
  if (!product.category.effective_active) return 'Categoría principal inactiva'
  if (!product.is_available) return 'Agotado'
  if (product.tax_profile && !product.tax_profile.is_active) return 'Perfil de impuestos archivado'
  if (product.variants_count > 0 && product.available_variants_count === 0)
    return 'Variantes no disponibles'
  if (product.availability_context?.allowed === false) return 'Fuera de horario'
  if (product.kind === 'combo' && !product.combo_context?.ready)
    return product.combo_context?.reason ?? 'Combo por configurar'
  return 'Disponible'
}
export type CatalogPage<T> = {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    total: number
    from: number | null
    to: number | null
  }
}
