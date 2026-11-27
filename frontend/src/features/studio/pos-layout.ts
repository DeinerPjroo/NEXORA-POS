import type { CSSProperties } from 'react'
import { foreground } from '../../lib/theme'

export const posComponents = {
  actions: {
    name: 'Acciones rápidas',
    description: 'Mesas, cliente, notas e impresión. Siempre disponible.',
  },
  order: { name: 'Pedido y resumen', description: 'Líneas, subtotal y acciones de cocina/cobro.' },
  categories: { name: 'Categorías', description: 'Selector real de categorías del catálogo.' },
  products: {
    name: 'Productos y teclado',
    description: 'Buscador, catálogo y teclado táctil fijo.',
  },
} as const
export type PosPanel = keyof typeof posComponents
export type PosLayout = {
  schema_version: 1 | 2
  panels: PosPanel[]
  tokens: {
    order_width: number
    category_width: number
    product_columns: number
    card_height: number
    gap: number
    radius: number
    font_size: number
    accent: string
  }
  options: { photos: boolean; hints: boolean; theme?: 'inherit' | 'light' | 'dark' }
}
export const defaultPosConfiguration: PosLayout = {
  schema_version: 1,
  panels: ['actions', 'order', 'categories', 'products'],
  tokens: {
    order_width: 480,
    category_width: 110,
    product_columns: 3,
    card_height: 86,
    gap: 10,
    radius: 8,
    font_size: 14,
    accent: '#7258df',
  },
  options: { photos: false, hints: true },
}
export const tokenBounds = {
  order_width: [320, 560],
  category_width: [90, 150],
  product_columns: [2, 4],
  card_height: [80, 104],
  gap: [6, 14],
  radius: [0, 16],
  font_size: [14, 18],
} as const
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  )
}
export function parsePosLayout(value: unknown): PosLayout | null {
  if (
    !exactKeys(value, ['schema_version', 'panels', 'tokens', 'options']) ||
    ![1, 2].includes(value.schema_version as number) ||
    !Array.isArray(value.panels) ||
    value.panels.length !== 4 ||
    new Set(value.panels).size !== 4 ||
    !value.panels.every((key) => typeof key === 'string' && Object.hasOwn(posComponents, key))
  )
    return null
  if (
    !exactKeys(value.tokens, [...Object.keys(tokenBounds), 'accent']) ||
    !exactKeys(
      value.options,
      value.schema_version === 2 ? ['photos', 'hints', 'theme'] : ['photos', 'hints'],
    ) ||
    typeof value.options.photos !== 'boolean' ||
    typeof value.options.hints !== 'boolean' ||
    typeof value.tokens.accent !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(value.tokens.accent)
  )
    return null
  if (
    value.schema_version === 2 &&
    !['inherit', 'light', 'dark'].includes(value.options.theme as string)
  )
    return null
  const tokens = value.tokens
  if (
    !Object.entries(tokenBounds).every(
      ([key, [min, max]]) =>
        typeof tokens[key] === 'number' &&
        Number.isInteger(tokens[key]) &&
        (tokens[key] as number) >= min &&
        (tokens[key] as number) <= max,
    )
  )
    return null
  return value as unknown as PosLayout
}
export function posLayoutStyle(config: PosLayout): CSSProperties {
  const widths: Record<PosPanel, string> = {
    actions: '82px',
    order: `minmax(280px, min(${config.tokens.order_width}px, 44vw))`,
    categories: `${config.tokens.category_width}px`,
    products: 'minmax(240px, 1fr)',
  }
  return {
    '--pos-primary': config.tokens.accent,
    '--studio-accent-ink': foreground(config.tokens.accent),
    '--studio-tracks': config.panels.map((panel) => widths[panel]).join(' '),
    '--studio-order-column': config.panels.indexOf('order') + 1,
    '--studio-actions-column': config.panels.indexOf('actions') + 1,
    '--studio-categories-column': config.panels.indexOf('categories') + 1,
    '--studio-products-column': config.panels.indexOf('products') + 1,
    '--studio-columns': config.tokens.product_columns,
    '--studio-card-height': `${config.tokens.card_height}px`,
    '--studio-gap': `${config.tokens.gap}px`,
    '--studio-radius': `${config.tokens.radius}px`,
    '--studio-font': `${config.tokens.font_size}px`,
  } as CSSProperties
}
