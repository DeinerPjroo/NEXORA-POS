import { useState } from 'react'
import { formatMoney } from '../../lib/money'
import { cartSubtotal } from '../orders/cart'
import type { CartLine } from '../orders/cart'
import { ModifierDetails } from '../orders/ModifierDetails'
import { CartComboDetails } from '../orders/CartComboDetails'

export function PosOrderLines({
  lines,
  currency,
  selectedKey,
  disabled,
  onSelect,
  onQuantity,
  onRemove,
  onNotes,
}: {
  lines: CartLine[]
  currency: string
  selectedKey: string | null
  disabled: boolean
  onSelect: (key: string) => void
  onQuantity: (key: string, quantity: number) => void
  onRemove: (key: string) => void
  onNotes: (key: string, notes: string) => void
}) {
  const [editingNotes, setEditingNotes] = useState(false)
  const selected = lines.find((line) => line.key === selectedKey) ?? lines.at(-1)
  return (
    <section className="pos-order-ledger" aria-label="Comanda del pedido">
      <div className="pos-order-lines-scroll cart-lines">
        <table className="pos-order-table" aria-label="Líneas del pedido">
          <thead>
            <tr>
              <th scope="col">Cant.</th>
              <th scope="col">Producto</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.key}
                data-selected={selected?.key === line.key}
                onClick={() => onSelect(line.key)}
              >
                <td>{line.quantity}</td>
                <td>
                  <button
                    type="button"
                    className="pos-line-select"
                    disabled={disabled}
                    aria-label={`Seleccionar ${line.product_name}`}
                    onClick={() => onSelect(line.key)}
                  >
                    {line.product_name}
                  </button>
                  {line.variant_name && <small>{line.variant_name}</small>}
                  <small>
                    {formatMoney(cartSubtotal([{ ...line, quantity: 1 }]), currency)} c/u
                  </small>
                  <ModifierDetails groups={line.modifier_labels} currency={currency} />
                  <CartComboDetails line={line} currency={currency} />
                  {line.notes && <small className="pos-line-note">Nota: {line.notes}</small>}
                </td>
                <td>{formatMoney(cartSubtotal([line]), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lines.length && (
          <div className="pos-order-empty cart-empty">
            <p>Pedido sin líneas</p>
            <small>Selecciona productos del menú para comenzar.</small>
          </div>
        )}
      </div>
      {selected && (
        <div className="pos-line-actions" aria-label="Acciones de la línea seleccionada">
          <button
            type="button"
            disabled={disabled || selected.quantity <= 1}
            aria-label={`Restar ${selected.product_name}`}
            onClick={() => onQuantity(selected.key, selected.quantity - 1)}
          >
            −
          </button>
          <output>{selected.quantity}</output>
          <button
            type="button"
            disabled={disabled || selected.quantity >= 999}
            aria-label={`Sumar ${selected.product_name}`}
            onClick={() => onQuantity(selected.key, selected.quantity + 1)}
          >
            +
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-expanded={editingNotes}
            onClick={() => setEditingNotes(!editingNotes)}
          >
            Nota
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Quitar ${selected.product_name}`}
            onClick={() => onRemove(selected.key)}
          >
            Quitar
          </button>
        </div>
      )}
      {selected && editingNotes && (
        <input
          className="pos-line-notes-input"
          aria-label={`Observación para ${selected.product_name}`}
          value={selected.notes}
          maxLength={300}
          disabled={disabled}
          onChange={(e) => onNotes(selected.key, e.target.value)}
          placeholder="Indicación de preparación…"
        />
      )}
    </section>
  )
}
