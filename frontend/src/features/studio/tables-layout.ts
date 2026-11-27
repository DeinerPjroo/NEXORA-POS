import type { CSSProperties } from 'react'

export const tableBounds = {
  card_width: [130, 240],
  card_height: [130, 200],
  gap: [6, 16],
  radius: [4, 16],
  font_size: [14, 20],
} as const
export type TablesLayout = {
  schema_version: 1
  tokens: Record<keyof typeof tableBounds, number> & {
    available: string
    occupied: string
    paid: string
  }
  options: { capacity: boolean; symbol: boolean }
}
export const defaultTablesLayout: TablesLayout = {
  schema_version: 1,
  tokens: {
    card_width: 160,
    card_height: 156,
    gap: 9,
    radius: 10,
    font_size: 14,
    available: '#20a68a',
    occupied: '#dc9940',
    paid: '#7258df',
  },
  options: { capacity: true, symbol: true },
}
export const compactTablesLayout: TablesLayout = {
  ...defaultTablesLayout,
  tokens: { ...defaultTablesLayout.tokens, card_width: 130, card_height: 130, gap: 6, radius: 6 },
  options: { capacity: true, symbol: false },
}
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key))
  )
}
export function parseTablesLayout(value: unknown): TablesLayout | null {
  if (
    !keys(value, ['schema_version', 'tokens', 'options']) ||
    value.schema_version !== 1 ||
    !keys(value.tokens, [...Object.keys(tableBounds), 'available', 'occupied', 'paid']) ||
    !keys(value.options, ['capacity', 'symbol'])
  )
    return null
  const tokens = value.tokens
  if (
    !Object.entries(tableBounds).every(
      ([key, [min, max]]) =>
        typeof tokens[key] === 'number' &&
        Number.isInteger(tokens[key]) &&
        tokens[key] >= min &&
        tokens[key] <= max,
    )
  )
    return null
  if (
    !['available', 'occupied', 'paid'].every(
      (key) => typeof tokens[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(tokens[key]),
    )
  )
    return null
  if (typeof value.options.capacity !== 'boolean' || typeof value.options.symbol !== 'boolean')
    return null
  return value as unknown as TablesLayout
}
export function tablesStyle(config: TablesLayout): CSSProperties {
  return {
    '--studio-table-width': `${config.tokens.card_width}px`,
    '--studio-table-height': `${config.tokens.card_height}px`,
    '--studio-table-gap': `${config.tokens.gap}px`,
    '--studio-table-radius': `${config.tokens.radius}px`,
    '--studio-table-font': `${config.tokens.font_size}px`,
    '--table-free': config.tokens.available,
    '--table-busy': config.tokens.occupied,
    '--studio-table-paid': config.tokens.paid,
  } as CSSProperties
}
