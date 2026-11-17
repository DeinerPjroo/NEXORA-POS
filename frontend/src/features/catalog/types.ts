export type CategorySummary = { id: number; name: string; color: string; is_active: boolean }
export type Category = CategorySummary & {
  description: string | null
  products_count: number
  revision: number
}
export type Variant = {
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
  revision: number
}
export function productStatus(product: Product) {
  if (!product.is_active) return 'Inactivo'
  if (!product.category.is_active) return 'Categoría inactiva'
  if (!product.is_available) return 'Agotado'
  if (product.variants_count > 0 && product.available_variants_count === 0)
    return 'Variantes no disponibles'
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
