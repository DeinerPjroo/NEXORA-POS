export const widgetNames = {
  totals: 'Ventas y cobros',
  chart: 'Gráfico diario',
  methods: 'Métodos de pago',
  products: 'Productos y operadores',
  live: 'Operación actual',
}
export type Widget = keyof typeof widgetNames
export function loadWidgets(key: string): Widget[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (
      Array.isArray(saved) &&
      saved.every((v) => typeof v === 'string' && Object.hasOwn(widgetNames, v))
    )
      return [...new Set(saved)] as Widget[]
  } catch {
    /* Preferencias opcionales; la vista funciona sin almacenamiento. */
  }
  return Object.keys(widgetNames) as Widget[]
}
export function saveWidgets(key: string, values: Widget[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(values))
  } catch {
    /* Mantener la selección en memoria cuando el navegador no permite persistirla. */
  }
}
