import type { CSSProperties } from 'react'
export const deliveryBounds = {
  detail_width: [420, 680],
  card_width: [205, 320],
  font_size: [14, 20],
  gap: [6, 16],
  radius: [4, 16],
} as const
export const deliveryColors = {
  pending: 'Color por asignar',
  assigned: 'Color asignado',
  out_for_delivery: 'Color en reparto',
  delivered: 'Color entregado',
  cancelled: 'Color cancelado',
}
export type DeliveriesLayout = {
  schema_version: 1
  tokens: Record<keyof typeof deliveryBounds, number> & Record<keyof typeof deliveryColors, string>
}
export const defaultDeliveriesLayout: DeliveriesLayout = {
  schema_version: 1,
  tokens: {
    detail_width: 520,
    card_width: 230,
    font_size: 16,
    gap: 9,
    radius: 9,
    pending: '#cb922f',
    assigned: '#258ca7',
    out_for_delivery: '#7255db',
    delivered: '#209b79',
    cancelled: '#cc5365',
  },
}
export const compactDeliveriesLayout: DeliveriesLayout = {
  ...defaultDeliveriesLayout,
  tokens: {
    ...defaultDeliveriesLayout.tokens,
    card_width: 205,
    detail_width: 480,
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
export function parseDeliveriesLayout(value: unknown): DeliveriesLayout | null {
  if (
    !keys(value, ['schema_version', 'tokens']) ||
    value.schema_version !== 1 ||
    !keys(value.tokens, [...Object.keys(deliveryBounds), ...Object.keys(deliveryColors)])
  )
    return null
  const tokens = value.tokens
  if (
    !Object.entries(deliveryBounds).every(
      ([key, [min, max]]) =>
        typeof tokens[key] === 'number' &&
        Number.isInteger(tokens[key]) &&
        tokens[key] >= min &&
        tokens[key] <= max,
    )
  )
    return null
  if (
    !Object.keys(deliveryColors).every(
      (key) => typeof tokens[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(tokens[key]),
    )
  )
    return null
  return value as unknown as DeliveriesLayout
}
export function deliveriesStyle(config: DeliveriesLayout): CSSProperties {
  const tokens: Record<string, string> = {}
  for (const key of Object.keys(deliveryBounds))
    tokens[`--studio-delivery-${key.replaceAll('_', '-')}`] =
      `${config.tokens[key as keyof typeof deliveryBounds]}px`
  for (const key of Object.keys(deliveryColors))
    tokens[`--studio-delivery-${key}`] = config.tokens[key as keyof typeof deliveryColors]
  return tokens as CSSProperties
}
