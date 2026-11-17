import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { TaxProfile } from './tax-types'

export function TaxProfileEditor({
  initial,
  onClose,
}: {
  initial: TaxProfile | null
  onClose: () => void
}) {
  const [revision] = useState(initial?.revision)
  const [name, setName] = useState(initial?.name ?? '')
  const [mode, setMode] = useState(initial?.price_mode ?? 'exclusive')
  const [active, setActive] = useState(initial?.is_active ?? true)
  const [rates, setRates] = useState(() =>
    (initial?.rates ?? [{ name: '', rate: '' }]).map((rate) => ({
      ...rate,
      key: crypto.randomUUID(),
    })),
  )
  const client = useQueryClient()
  const toast = useToast()
  async function saved() {
    await Promise.all(
      ['tax-profiles', 'products', 'product'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
    toast('Perfil de impuestos guardado. Los pedidos anteriores conservan sus tasas.')
    onClose()
  }
  const create = useOperation<TaxProfile>('tax-profiles', saved)
  const update = useMutation({
    mutationFn: (body: unknown) => api(`tax-profiles/${initial!.id}`, { method: 'PUT', body }),
    onSuccess: saved,
  })
  const error = initial ? update.error : create.error
  const locked = initial ? update.isPending : create.locked
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!initial && create.uncertain) {
      create.send({})
      return
    }
    const body = {
      name,
      price_mode: mode,
      is_active: active,
      rates: rates.map((rate) => ({ name: rate.name, rate: rate.rate.replace(',', '.') })),
      ...(initial ? { revision } : {}),
    }
    if (initial) update.mutate(body)
    else create.send(body)
  }
  return (
    <Modal
      title={initial ? `Editar perfil: ${initial.name}` : 'Nuevo perfil de impuestos'}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={error} />
        {!initial && <OperationNotice uncertain={create.uncertain} />}
        <fieldset disabled={locked} className="form-stack">
          <Field label="Nombre del perfil">
            <input
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Precio del perfil">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as TaxProfile['price_mode'])}
            >
              <option value="exclusive">El impuesto se añade al precio</option>
              <option value="inclusive">El precio ya incluye los impuestos</option>
            </select>
          </Field>
          <p className="muted small">
            Hasta cinco impuestos paralelos sobre la misma base. Define las tasas que correspondan a
            tu operación; no se asignan tasas ni un régimen legal.
          </p>
          {rates.map((rate, index) => (
            <div className="form-stack sale-account-card" key={rate.key}>
              <Field label={`Nombre del impuesto ${index + 1}`}>
                <input
                  required
                  maxLength={40}
                  value={rate.name}
                  onChange={(event) =>
                    setRates(
                      rates.map((item) =>
                        item.key === rate.key ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label={`Tasa del impuesto ${index + 1} (%)`}>
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,4})?"
                  value={rate.rate}
                  onChange={(event) =>
                    setRates(
                      rates.map((item) =>
                        item.key === rate.key ? { ...item, rate: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              {rates.length > 1 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRates(rates.filter((item) => item.key !== rate.key))}
                >
                  Retirar impuesto {index + 1}
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            disabled={rates.length >= 5}
            onClick={() => setRates([...rates, { key: crypto.randomUUID(), name: '', rate: '' }])}
          >
            Agregar impuesto al perfil
          </button>
          <label className="check-line">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Perfil activo para nuevos pedidos
          </label>
        </fieldset>
        {error instanceof ApiError && error.status === 409 && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void client.invalidateQueries({ queryKey: ['tax-profiles'] })
              onClose()
            }}
          >
            Revisar versión actual
          </button>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit pending={locked && (initial ? update.isPending : create.isPending)}>
            {!initial && create.uncertain
              ? 'Reintentar creación de perfil'
              : 'Guardar perfil de impuestos'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
