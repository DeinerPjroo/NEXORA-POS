import type { CSSProperties } from 'react'
import { widgetNames, type Widget } from '../dashboard/widgets'

export const dashboardBounds = {
  columns: [2, 4],
  gap: [8, 24],
  radius: [4, 20],
  font_size: [14, 20],
} as const
export type DashboardLayout = {
  schema_version: 1
  widgets: Widget[]
  tokens: Record<keyof typeof dashboardBounds, number> & { accent: string }
  options: Record<Widget, boolean>
}
export const defaultDashboardLayout: DashboardLayout = {
  schema_version: 1,
  widgets: ['totals', 'live', 'chart', 'methods', 'products'],
  tokens: { columns: 3, gap: 16, radius: 12, font_size: 16, accent: '#7258df' },
  options: { totals: true, live: true, chart: true, methods: true, products: true },
}
export const compactDashboardLayout: DashboardLayout = {
  ...defaultDashboardLayout,
  tokens: { ...defaultDashboardLayout.tokens, columns: 4, gap: 8, radius: 6, font_size: 14 },
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
export function parseDashboardLayout(value: unknown): DashboardLayout | null {
  if (
    !keys(value, ['schema_version', 'widgets', 'tokens', 'options']) ||
    value.schema_version !== 1 ||
    !keys(value.tokens, [...Object.keys(dashboardBounds), 'accent']) ||
    !keys(value.options, Object.keys(widgetNames)) ||
    !Array.isArray(value.widgets) ||
    value.widgets.length !== 5 ||
    new Set(value.widgets).size !== 5 ||
    !value.widgets.every((key) => typeof key === 'string' && Object.hasOwn(widgetNames, key))
  )
    return null
  const tokens = value.tokens
  const options = value.options
  if (
    !Object.entries(dashboardBounds).every(
      ([key, [min, max]]) =>
        typeof tokens[key] === 'number' &&
        Number.isInteger(tokens[key]) &&
        tokens[key] >= min &&
        tokens[key] <= max,
    )
  )
    return null
  if (
    typeof tokens.accent !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(tokens.accent) ||
    !Object.keys(widgetNames).every((key) => typeof options[key] === 'boolean')
  )
    return null
  return value as unknown as DashboardLayout
}
export function dashboardStyle(config: DashboardLayout): CSSProperties {
  return {
    '--studio-dashboard-columns': config.tokens.columns,
    '--studio-dashboard-gap': `${config.tokens.gap}px`,
    '--studio-dashboard-radius': `${config.tokens.radius}px`,
    '--studio-dashboard-font': `${config.tokens.font_size}px`,
    '--studio-dashboard-accent': config.tokens.accent,
  } as CSSProperties
}
