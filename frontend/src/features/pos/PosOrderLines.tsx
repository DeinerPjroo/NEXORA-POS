import { useState } from 'react'
import { formatMoney } from '../../lib/money'
import { cartSubtotal } from '../orders/cart'
import type { CartLine } from '../orders/cart'
import { ModifierDetails } from '../orders/ModifierDetails'
import { CartComboDetails } from '../orders/CartComboDetails'
import { ListPlus, Minus, Plus, StickyNote, Trash2 } from 'lucide-react'
import type { OrderItem } from '../operations/types'
import { unifiedOrderLines } from './unified-order'
import { Modal, Field } from '../../components/ui'
import { preparationLabels } from '../kitchen/TableKitchen'

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
  destinations = false, onDestination, onSplit, onCorrect,
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
  destinations?: boolean
  onDestination?: (key:string,destination:'table'|'takeaway')=>void
  onSplit?: (key:string,quantity:number)=>void
  onCorrect?: (ids:number[])=>void
}) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [splitting,setSplitting]=useState(false)
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
                  {destinations && line.draftQuantity ? <div className="preparation-selector" role="group" aria-label={`Destino de ${line.product_name}`}>
                    {(['table','takeaway'] as const).map(d=><button key={d} type="button" disabled={disabled} aria-pressed={line.preparation_destination===d} onClick={()=>onDestination?.(line.key,d)}>{d==='table'?'Para mesa':'Para llevar'}</button>)}
                  </div> : <span className="preparation-badge" data-destination={line.preparation_destination}>{preparationLabels[line.preparation_destination ?? 'table']}</span>}
                  {destinations && line.recordedItemIds.length>0 && onCorrect && <button className="text-button" type="button" disabled={disabled} onClick={()=>onCorrect(line.recordedItemIds)}>Corregir destino registrado</button>}
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
          {destinations && onSplit && <button type="button" disabled={disabled || selected.quantity<2} onClick={()=>setSplitting(true)}>Separar destino</button>}
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
      {selected && splitting && <Modal title="Separar cantidades por destino" onClose={()=>setSplitting(false)} locked={disabled}><form className="form-stack" onSubmit={e=>{e.preventDefault();const amount=Number(new FormData(e.currentTarget).get('quantity'));onSplit?.(selected.key,amount);setSplitting(false)}}><p>{selected.product_name}: {selected.quantity} unidades nuevas. La cantidad elegida irá al otro destino.</p><Field label="Cantidad a separar"><input name="quantity" type="number" inputMode="numeric" defaultValue={1} min={1} max={selected.quantity-1} required disabled={disabled}/></Field><button className="button primary" disabled={disabled} type="submit">Separar cantidad</button></form></Modal>}
    </section>
  )
}
