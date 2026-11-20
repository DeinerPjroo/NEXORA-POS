import { useState } from 'react'
import { UsersRound, Minus, Plus, Check } from 'lucide-react'
import { formatMoney } from '../../lib/money'
import type { AccountPart } from '../sales/types'
import './split-accounts.css'

export function PosSplitAccounts({
  count,
  selected,
  parts,
  currency,
  pending,
  error,
  onCount,
  onSelect,
}: {
  count: string
  selected: string
  parts: AccountPart[]
  currency: string
  pending: boolean
  error: boolean
  onCount: (count: string) => void
  onSelect: (number: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = parts.find((part) => String(part.number) === selected)
  return (
    <section className="pos-split-accounts" aria-label="División de cuenta">
      <button
        type="button"
        className="pos-split-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <UsersRound size={20} />
        <span>
          <strong>Dividir cuenta</strong>
          <small>{count ? `${count} partes iguales` : 'Cuenta completa'}</small>
        </span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <div className="pos-split-presets" role="group" aria-label="Número de cuentas">
            <button type="button" aria-pressed={!count} onClick={() => onCount('')}>
              Sin dividir
            </button>
            {[2, 3, 4, 6].map((number) => (
              <button
                type="button"
                key={number}
                aria-label={`Dividir en ${number} cuentas`}
                aria-pressed={count === String(number)}
                onClick={() => onCount(String(number))}
              >
                {number}
              </button>
            ))}
          </div>
          <div className="pos-split-stepper">
            <span>Partes iguales</span>
            <button
              type="button"
              aria-label="Quitar una cuenta"
              disabled={!count || Number(count) <= 2}
              onClick={() => onCount(String(Number(count) - 1))}
            >
              <Minus size={16} />
            </button>
            <output aria-label="Cantidad de cuentas">{count || '1'}</output>
            <button
              type="button"
              aria-label="Añadir una cuenta"
              disabled={Number(count) >= 20}
              onClick={() => onCount(String(Number(count || 1) + 1))}
            >
              <Plus size={16} />
            </button>
          </div>
          {count &&
            (pending ? (
              <p className="pos-split-hint" role="status">
                Calculando importes…
              </p>
            ) : error ? (
              <p className="notice">No se pudo calcular la división. Revisa los datos del cobro.</p>
            ) : (
              <>
                <p className="pos-split-hint">Toca la cuenta que vas a cobrar.</p>
                <div className="pos-split-parts" role="group" aria-label="Elegir cuenta a cobrar">
                  {parts.map((part) => (
                    <button
                      type="button"
                      key={part.number}
                      aria-label={`Cobrar ${part.label}`}
                      aria-pressed={String(part.number) === selected}
                      onClick={() => onSelect(String(part.number))}
                    >
                      <span>
                        {part.label}
                        {String(part.number) === selected && <Check size={14} />}
                      </span>
                      <strong>{formatMoney(part.amount, currency)}</strong>
                    </button>
                  ))}
                </div>
              </>
            ))}
          <small className="pos-split-hint">
            Elige la división antes del primer pago. Se conserva una sola venta.
          </small>
        </>
      )}
      {count && active && !pending && !error && (
        <div className="pos-split-selected" aria-live="polite">
          <Check size={15} />
          <span>A cobrar: {active.label}</span>
          <strong>{formatMoney(active.amount, currency)}</strong>
        </div>
      )}
    </section>
  )
}
