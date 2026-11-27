import type { CSSProperties, ReactNode } from 'react'
import './print-layout.css'

export type PrintLayout = {
  schema_version: 1
  tokens: { paper_width: number; font_size: number; line_height: number; spacing: number }
  options: { center_header: boolean }
  texts: { footer: string }
}
export const defaultPrintLayout: PrintLayout = {
  schema_version: 1,
  tokens: { paper_width: 80, font_size: 12, line_height: 140, spacing: 4 },
  options: { center_header: true },
  texts: { footer: '' },
}
export const compactPrintLayout: PrintLayout = {
  ...defaultPrintLayout,
  tokens: { paper_width: 58, font_size: 11, line_height: 130, spacing: 3 },
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
export function parsePrintLayout(value: unknown): PrintLayout | null {
  if (
    !keys(value, ['schema_version', 'tokens', 'options', 'texts']) ||
    value.schema_version !== 1 ||
    !keys(value.tokens, ['paper_width', 'font_size', 'line_height', 'spacing']) ||
    !keys(value.options, ['center_header']) ||
    !keys(value.texts, ['footer'])
  )
    return null
  const t = value.tokens
  if (
    ![58, 80].includes(t.paper_width as number) ||
    !(
      [
        ['font_size', 10, 16],
        ['line_height', 120, 170],
        ['spacing', 2, 8],
      ] as const
    ).every(
      ([key, min, max]) =>
        typeof t[key] === 'number' && Number.isInteger(t[key]) && t[key] >= min && t[key] <= max,
    )
  )
    return null
  if (
    typeof value.options.center_header !== 'boolean' ||
    typeof value.texts.footer !== 'string' ||
    value.texts.footer.length > 180
  )
    return null
  return value as unknown as PrintLayout
}
export function PrintLayoutFrame({
  config,
  width,
  children,
}: {
  config: PrintLayout | null
  width: string
  children: ReactNode
}) {
  const style = config
    ? ({
        '--studio-print-font': `${config.tokens.font_size}px`,
        '--studio-print-line-height': config.tokens.line_height / 100,
        '--studio-print-spacing': `${config.tokens.spacing}px`,
        '--studio-print-header': config.options.center_header ? 'center' : 'left',
      } as CSSProperties)
    : undefined
  return (
    <div className="studio-print-layout" data-custom={!!config} data-width={width} style={style}>
      {children}
      {config?.texts.footer && <p className="studio-print-footer">{config.texts.footer}</p>}
    </div>
  )
}
