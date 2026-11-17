import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { useSession } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { CashRegister, CashSession } from '../operations/types'

type Props = {
  mode: 'register' | 'open' | 'income' | 'expense' | 'close'
  register?: CashRegister
  session?: CashSession
  branchId?: number
  onClose: () => void
}
export function CashCommandModal({ mode, register, session, branchId, onClose }: Props) {
  const { session: identity } = useSession()
  const [revision] = useState(session?.revision)
  const [currency] = useState(session?.currency ?? identity!.company.currency)
  const client = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const path =
    mode === 'register'
      ? 'cash/registers'
      : mode === 'open'
        ? `cash/registers/${register!.id}/open`
        : `cash/sessions/${session!.id}/${mode === 'close' ? 'close' : 'movements'}`
  const operation = useOperation<{ id: number }>(path, async (result) => {
    await Promise.all(
      ['cash-registers', 'cash-sessions', 'cash-session', 'cash-movements', 'overview'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    toast(
      mode === 'close'
        ? 'Cierre de caja registrado.'
        : mode === 'open'
          ? 'Caja abierta.'
          : mode === 'register'
            ? 'Nueva caja creada.'
            : 'Movimiento de caja registrado.',
    )
    onClose()
    if (mode === 'open') navigate(`/caja/sesiones/${result.id}`)
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    for (const field of ['amount', 'opening_amount', 'counted_amount'])
      if (typeof values[field] === 'string') values[field] = values[field].replace(',', '.')
    operation.send({
      ...values,
      ...(mode === 'register'
        ? { branch_id: branchId }
        : mode === 'open'
          ? { currency }
          : { revision }),
      ...(mode === 'income' || mode === 'expense' ? { type: mode } : {}),
    })
  }
  const titles = {
    register: 'Una caja para tu sucursal',
    open: 'Abrir caja',
    income: 'Registrar ingreso manual',
    expense: 'Registrar egreso manual',
    close: 'Cerrar caja y registrar arqueo',
  }
  return (
    <Modal title={titles[mode]} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          {mode === 'register' ? (
            <>
              <Field label="Nombre de la caja">
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Ej. Caja terraza"
                  autoFocus
                />
              </Field>
              <Field label="Código de la caja">
                <input
                  name="code"
                  required
                  pattern="[A-Za-z0-9_-]+"
                  maxLength={20}
                  placeholder="TERRAZA"
                />
              </Field>
            </>
          ) : (
            <>
              <p className="muted">
                {register?.name ?? session?.register_name} · {currency}
              </p>
              <Field
                label={
                  mode === 'open'
                    ? 'Base inicial de caja'
                    : mode === 'close'
                      ? 'Efectivo contado al cierre'
                      : 'Importe del movimiento'
                }
                hint="Sin separadores de miles. Hasta 4 decimales."
              >
                <input
                  name={
                    mode === 'open'
                      ? 'opening_amount'
                      : mode === 'close'
                        ? 'counted_amount'
                        : 'amount'
                  }
                  inputMode="decimal"
                  required
                  pattern="[0-9]+([.,][0-9]{1,4})?"
                  maxLength={20}
                  placeholder="0"
                  autoFocus
                />
              </Field>
              {mode === 'close' ? (
                <Field label="Observación del cierre">
                  <textarea name="closing_note" rows={3} maxLength={500} />
                </Field>
              ) : (
                mode !== 'open' && (
                  <Field label="Motivo del movimiento">
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={300}
                      rows={3}
                      placeholder="Explica el origen del ingreso o el motivo del egreso."
                    />
                  </Field>
                )
              )}
            </>
          )}
        </fieldset>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cerrar
          </button>
          <Submit pending={operation.isPending}>
            {operation.uncertain
              ? 'Reintentar envío'
              : mode === 'close'
                ? 'Confirmar cierre'
                : mode === 'open'
                  ? 'Confirmar apertura'
                  : 'Guardar operación'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
