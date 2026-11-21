export function CashTenderKeypad({
  value,
  onChange,
  label = 'Efectivo',
}: {
  value: string
  onChange: (value: string) => void
  label?: 'Efectivo' | 'Importe'
}) {
  return (
    <div
      className="cash-tender-keypad"
      role="group"
      aria-label={label === 'Efectivo' ? 'Teclado de efectivo' : 'Teclado de importe'}
    >
      {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '.', '⌫'].map((key) => (
        <button
          type="button"
          key={key}
          aria-label={
            key === 'C'
              ? `Limpiar ${label.toLowerCase()}`
              : key === '⌫'
                ? 'Borrar último dígito'
                : `${label} ${key}`
          }
          onClick={() => {
            const current = value.replace(',', '.')
            const next =
              key === 'C'
                ? ''
                : key === '⌫'
                  ? current.slice(0, -1)
                  : key === '.' && !current
                    ? '0.'
                    : current + key
            if (/^\d{0,15}(?:\.\d{0,2})?$/.test(next)) onChange(next)
          }}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
