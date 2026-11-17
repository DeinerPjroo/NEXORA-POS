// El precio llega como cadena decimal. BigInt conserva todos los dígitos del importe.
export function formatMoney(value: string, currency = 'COP', locale = 'es-CO'): string {
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(value)) return '—'
  const negative = value.startsWith('-')
  const [integer, decimals = ''] = (negative ? value.slice(1) : value).split('.')
  const negativeZero = negative && BigInt(integer) === 0n
  const fraction = decimals.replace(/0+$/, '').padEnd(2, '0')
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(negativeZero ? -1n : BigInt(`${negative ? '-' : ''}${integer}`))
    .map((part) =>
      part.type === 'fraction'
        ? fraction
        : negativeZero && part.type === 'integer'
          ? '0'
          : part.value,
    )
    .join('')
}

export function moneyUnits(value: string): bigint {
  const negative = value.startsWith('-')
  const [integer, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const amount = BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0'))
  return negative ? -amount : amount
}
export function unitsToMoney(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const amount = value < 0n ? -value : value
  return `${sign}${amount / 10000n}.${String(amount % 10000n).padStart(4, '0')}`
}
