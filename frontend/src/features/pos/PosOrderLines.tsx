import { useState } from 'react'
import { formatMoney } from '../../lib/money'
import { cartSubtotal } from '../orders/cart'
import type { CartLine } from '../orders/cart'
import { ModifierDetails } from '../orders/ModifierDetails'
import { CartComboDetails } from '../orders/CartComboDetails'
import { ListPlus, Minus, Plus, StickyNote, Trash2 } from 'lucide-react'
import type { OrderItem } from '../operations/types'
import { unifiedOrderLines } from './unified-order'

export function PosOrderLines({
  lines,
  recordedItems = [],
  currency,
  selectedKey,
  disabled,
  onSelect,
  onQuantity,
  onRemove,
  onNotes,
}: {
  lines: CartLine[]
  recordedItems?: OrderItem[]
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
  const displayLines = unifiedOrderLines(recordedItems, lines)
  const selectedDisplay = displayLines.find((line) => line.key === selected?.key)
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
            {displayLines.map((line) => (
              <tr
                key={line.key}
                data-selected={selected?.key === line.key}
                onClick={() => {
                  if (line.draftQuantity) onSelect(line.key)
                }}
              >
                <td>
                  <span className="pos-digital-quantity">{line.quantity}</span>
                </td>
                <td>
                  {line.draftQuantity ? (
                    <button
                      type="button"
                      className="pos-line-select"
                      disabled={disabled}
                      aria-label={`Seleccionar ${line.product_name}`}
                      onClick={() => onSelect(line.key)}
                    >
                      {line.product_name}
                    </button>
                  ) : (
                    <strong className="pos-line-select">{line.product_name}</strong>
                  )}
                  {line.variant_name && <small>{line.variant_name}</small>}
                  <small>
                    {formatMoney(cartSubtotal([{ ...line, quantity: 1 }]), currency)} c/u
                  </small>
                  <ModifierDetails groups={line.modifier_labels} currency={currency} />
                  <CartComboDetails line={line} currency={currency} />
                  {line.notes && <small className="pos-line-note">Nota: {line.notes}</small>}
                </td>
                <td>{formatMoney(line.displaySubtotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!displayLines.length && (
          <div className="pos-order-empty cart-empty">
            <ListPlus size={25} aria-hidden="true" />
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
            <Minus size={15} />
          </button>
          <output>{selectedDisplay?.quantity ?? selected.quantity}</output>
          <button
            type="button"
            disabled={disabled || selected.quantity >= 999}
            aria-label={`Sumar ${selected.product_name}`}
            onClick={() => onQuantity(selected.key, selected.quantity + 1)}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-expanded={editingNotes}
            onClick={() => setEditingNotes(!editingNotes)}
          >
            <StickyNote size={14} />
            Nota
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Quitar ${selected.product_name}`}
            onClick={() => onRemove(selected.key)}
          >
            <Trash2 size={14} />
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
