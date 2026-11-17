import { useState } from 'react'
import { Field } from '../../components/ui'
import { moneyUnits } from '../../lib/money'

type Adjustment = { type: 'fixed' | 'percentage'; value: string; tip: string }
const initial: Adjustment = { type: 'fixed', value: '0', tip: '0' }
const validMoney = (value: string) => /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(value)

export function useSaleAdjustments() {
  const [draft, setDraft] = useState(initial)
  const [applied, setApplied] = useState(initial)
  const [confirmed, setConfirmed] = useState(false)
  const value = draft.value.replace(',', '.')
  const tip = draft.tip.replace(',', '.')
  const valid =
    validMoney(value) &&
    validMoney(tip) &&
    (draft.type !== 'percentage' || moneyUnits(value) <= 1000000n)
  const dirty = draft.type !== applied.type || value !== applied.value || tip !== applied.tip
  const hasTip = moneyUnits(applied.tip) > 0n
  const params = new URLSearchParams({ discount_type: applied.type, tip_amount: applied.tip })
  params.set(applied.type === 'fixed' ? 'discount_amount' : 'discount_value', applied.value)
  function apply() {
    if (!valid) return
    if (applied.tip !== tip) setConfirmed(false)
    setApplied({ type: draft.type, value, tip })
  }
  function reset() {
    setDraft(initial)
    setApplied(initial)
    setConfirmed(false)
  }
  const payload = {
    discount_type: applied.type,
    ...(applied.type === 'fixed'
      ? { discount_amount: applied.value }
      : { discount_value: applied.value }),
    tip_amount: applied.tip,
    ...(hasTip ? { tip_confirmed: confirmed } : {}),
  }
  return {
    draft,
    setDraft,
    applied,
    confirmed,
    setConfirmed,
    valid,
    dirty,
    hasTip,
    params: params.toString(),
    payload,
    apply,
    reset,
    ready: !dirty && (!hasTip || confirmed),
  }
}

export function SaleAdjustments({
  state,
  canDiscount,
  canTip,
  fetching,
}: {
  state: ReturnType<typeof useSaleAdjustments>
  canDiscount: boolean
  canTip: boolean
  fetching: boolean
}) {
  return (
    <>
      {canDiscount && (
        <>
          <Field label="Tipo de descuento">
            <select
              value={state.draft.type}
              onChange={(event) =>
                state.setDraft({ ...state.draft, type: event.target.value as Adjustment['type'] })
              }
            >
              <option value="fixed">Valor fijo</option>
              <option value="percentage">Porcentaje</option>
            </select>
          </Field>
          <Field label={state.draft.type === 'fixed' ? 'Descuento en dinero' : 'Descuento (%)'}>
            <input
              value={state.draft.value}
              onChange={(event) => state.setDraft({ ...state.draft, value: event.target.value })}
              inputMode="decimal"
              required
              pattern="[0-9]+([.,][0-9]{1,2})?"
            />
          </Field>
        </>
      )}
      {canTip && (
        <Field
          label="Propina voluntaria"
          hint="Importe fijo aceptado por el cliente. No se agrega automáticamente."
        >
          <input
            value={state.draft.tip}
            onChange={(event) => {
              state.setDraft({ ...state.draft, tip: event.target.value })
              state.setConfirmed(false)
            }}
            inputMode="decimal"
            required
            pattern="[0-9]+([.,][0-9]{1,2})?"
          />
        </Field>
      )}
      {(canDiscount || canTip) && (
        <button
          type="button"
          className="button secondary"
          disabled={!state.valid || fetching}
          onClick={state.apply}
        >
          Actualizar total
        </button>
      )}
      {state.dirty && (
        <p className="muted small">
          Actualiza el total para revisar estos ajustes antes de cobrar.
        </p>
      )}
      {canDiscount && moneyUnits(state.applied.value) > 0n && (
        <Field label="Motivo del descuento">
          <input name="discount_reason" required minLength={3} maxLength={200} />
        </Field>
      )}
      {state.hasTip && (
        <label className="check-line">
          <input
            type="checkbox"
            required
            checked={state.confirmed}
            onChange={(event) => state.setConfirmed(event.target.checked)}
          />
          Confirmo que el cliente aceptó esta propina voluntariamente.
        </label>
      )}
    </>
  )
}
