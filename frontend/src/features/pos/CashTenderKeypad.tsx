export function CashTenderKeypad({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="cash-tender-keypad" role="group" aria-label="Teclado de efectivo">
      {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '.', '⌫'].map((key) => (
        <button
          type="button"
          key={key}
          aria-label={
            key === 'C'
              ? 'Limpiar efectivo'
              : key === '⌫'
                ? 'Borrar último dígito'
                : `Efectivo ${key}`
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
