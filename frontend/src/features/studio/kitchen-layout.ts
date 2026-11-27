import type { CSSProperties } from 'react'
import { foreground } from '../../lib/theme'

export const kitchenBounds = {
  column_width: [230, 360],
  font_size: [14, 20],
  padding: [8, 18],
  gap: [6, 16],
  radius: [4, 16],
} as const
export type KitchenLayout = {
  schema_version: 1
  tokens: Record<keyof typeof kitchenBounds, number> & {
    new_color: string
    preparing_color: string
    ready_color: string
  }
}
export const defaultKitchenLayout: KitchenLayout = {
  schema_version: 1,
  tokens: {
    column_width: 250,
    font_size: 16,
    padding: 14,
    gap: 12,
    radius: 12,
    new_color: '#7258cf',
    preparing_color: '#a86f13',
    ready_color: '#148765',
  },
}
export const compactKitchenLayout: KitchenLayout = {
  ...defaultKitchenLayout,
  tokens: {
    ...defaultKitchenLayout.tokens,
    column_width: 230,
    font_size: 14,
    padding: 8,
    gap: 6,
    radius: 6,
  },
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
export function parseKitchenLayout(value: unknown): KitchenLayout | null {
  if (
    !keys(value, ['schema_version', 'tokens']) ||
    value.schema_version !== 1 ||
    !keys(value.tokens, [
      ...Object.keys(kitchenBounds),
      'new_color',
      'preparing_color',
      'ready_color',
    ])
  )
    return null
  const tokens = value.tokens
  if (
    !Object.entries(kitchenBounds).every(
      ([key, [min, max]]) =>
        typeof tokens[key] === 'number' &&
        Number.isInteger(tokens[key]) &&
        tokens[key] >= min &&
        tokens[key] <= max,
    )
  )
    return null
  if (
    !['new_color', 'preparing_color', 'ready_color'].every(
      (key) => typeof tokens[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(tokens[key]),
    )
  )
    return null
  return value as unknown as KitchenLayout
}
export function kitchenStyle(config: KitchenLayout): CSSProperties {
  const tokens: Record<string, string> = {}
  for (const key of Object.keys(kitchenBounds))
    tokens[`--studio-kitchen-${key.replaceAll('_', '-')}`] =
      `${config.tokens[key as keyof typeof kitchenBounds]}px`
  for (const state of ['new', 'preparing', 'ready'] as const) {
    tokens[`--studio-kitchen-${state}`] = config.tokens[`${state}_color`]
    tokens[`--studio-kitchen-${state}-ink`] = foreground(config.tokens[`${state}_color`])
  }
  return tokens as CSSProperties
}
