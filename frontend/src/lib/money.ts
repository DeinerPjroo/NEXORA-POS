// El precio llega como cadena decimal. BigInt conserva todos los dígitos del importe.
export function formatMoney(value: string, currency = 'COP', locale = 'es-CO'): string {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return '—'
  const [integer, decimals = ''] = value.split('.')
  const fraction = decimals.replace(/0+$/, '').padEnd(2, '0')
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(BigInt(integer))
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('')
}
