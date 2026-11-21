import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import { PaymentMethodField, useDefaultPaymentMethod } from './PaymentMethodPicker'
import type { PaymentMethod, Sale } from './types'
import { useSalesCash } from './useSalesCash'
import { CashTenderKeypad } from '../pos/CashTenderKeypad'
import { ChangeDueDisplay } from '../pos/ChangeDueDisplay'

type DraftPayment = {
  account_id?: number
  key: string
  method: PaymentMethod
  amount: string
  received_amount: string
  reference: string
}
const validMoney = (value: string) => /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(value)

export function AddPaymentsModal({
  sale,
  onClose,
  embedded = false,
  initialAccountId,
  onPaid,
  onLockChange,
}: {
  sale: Sale
  onClose: () => void
  embedded?: boolean
  initialAccountId?: number
  onPaid?: (sale: Sale) => void
  onLockChange?: (locked: boolean) => void
}) {
  const [snapshot] = useState(sale)
  const [lines, setLines] = useState<DraftPayment[]>([])
  const [chosen, setChosen] = useState<PaymentMethod | null>(null)
  const [cashId, setCashId] = useState('')
  const [amount, setAmount] = useState<string | null>(null)
  const [received, setReceived] = useState('')
  const [reference, setReference] = useState('')
  const [accountId, setAccountId] = useState<number | null>(initialAccountId ?? null)
  const methods = useDefaultPaymentMethod()
  const method = chosen ?? methods.data?.data[0]
  const cash = useSalesCash(snapshot.branch_id)
  const selected =
    cash.data?.data.find((item) => String(item.id) === cashId) ??
    (cashId === '' ? cash.data?.data[0] : undefined)
  const total = lines.reduce((sum, line) => sum + moneyUnits(line.amount), 0n)
  const remaining = moneyUnits(snapshot.balance_due) - total
  const accounts = snapshot.accounts
    .map((account) => ({
      ...account,
      remaining:
        moneyUnits(account.balance_due) -
        lines
          .filter((line) => line.account_id === account.id)
          .reduce((sum, line) => sum + moneyUnits(line.amount), 0n),
    }))
    .filter((account) => account.remaining > 0n)
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0]
  const limit = account?.remaining ?? remaining
  const normalized = (amount ?? unitsToMoney(limit).slice(0, -2)).replace(',', '.')
  const tendered = received.replace(',', '.')
  const isCash = method?.kind === 'cash'
  const amountValid =
    validMoney(normalized) && moneyUnits(normalized) > 0n && moneyUnits(normalized) <= limit
  const ready =
    !!method &&
    (!snapshot.accounts.length || !!account) &&
    amountValid &&
    (isCash
      ? validMoney(tendered) && moneyUnits(tendered) >= moneyUnits(normalized)
      : !!reference.trim() && reference.length <= 120)
  const cashLines = lines.filter((line) => line.method.kind === 'cash')
  const preparedChange = cashLines.reduce(
    (sum, line) => sum + moneyUnits(line.received_amount) - moneyUnits(line.amount),
    0n,
  )
  const currentChange =
    isCash && received.trim()
      ? amountValid && validMoney(tendered) && moneyUnits(tendered) >= moneyUnits(normalized)
        ? moneyUnits(tendered) - moneyUnits(normalized)
        : null
      : 0n
  const changeDue =
    currentChange === null || (!received.trim() && !cashLines.length)
      ? null
      : unitsToMoney(preparedChange + currentChange)
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<Sale>(`sales/${snapshot.id}/payments`, async (updated) => {
    await Promise.all(
      [
        'sale',
        'sales',
        'order',
        'orders',
        'cash-registers',
        'cash-sessions',
        'cash-session',
        'cash-movements',
        'payment-history',
        'table-active-order',
        'table-orders',
        'dining-occupancy',
        'pos-cash',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    toast('Pagos registrados. El saldo se actualizó.')
    if (onPaid) onPaid(updated)
    else onClose()
  })
  useEffect(() => {
    onLockChange?.(operation.locked)
  }, [operation.locked, onLockChange])
  function add() {
    if (!ready || !method || lines.length >= 20) return
    setLines([
      ...lines,
      {
        key: crypto.randomUUID(),
        ...(account ? { account_id: account.id } : {}),
        method,
        amount: normalized,
        received_amount: isCash ? tendered : normalized,
        reference,
      },
    ])
    setAmount(null)
    setReceived('')
    setReference('')
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!selected || !lines.length) return
    operation.send({
      sale_revision: snapshot.revision,
      expected_balance: snapshot.balance_due.slice(0, -2),
      cash_session_id: selected.id,
      cash_revision: selected.revision,
      payments: lines.map((line) => ({
        ...(line.account_id ? { account_id: line.account_id } : {}),
        payment_method_id: line.method.id,
        method_revision: line.method.revision,
        amount: line.amount,
        received_amount: line.received_amount,
        reference: line.reference || null,
      })),
    })
  }
  return (
    <PaymentContainer
      embedded={embedded}
      title={`Agregar pagos · ${snapshot.receipt_code}`}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className={embedded ? 'digital-pay-total' : 'notice'}>
          {embedded ? (
            <>
              <span>
                {lines.length
                  ? 'PAGOS PREPARADOS'
                  : `A COBRAR · ${account?.label ?? 'Saldo pendiente'}`}
              </span>
              <strong>
                {formatMoney(lines.length ? unitsToMoney(total) : normalized, snapshot.currency)}
              </strong>
              <small>
                {selected?.name ?? 'Selecciona una caja abierta'} · Recibo {snapshot.receipt_code}
              </small>
              {isCash && (
                <div className="digital-tender-status" aria-live="polite">
                  <div>
                    <span>Recibido</span>
                    <strong>
                      {formatMoney(validMoney(tendered) ? tendered : '0', snapshot.currency)}
                    </strong>
                  </div>
                </div>
              )}
            </>
          ) : (
            <span>
              Saldo pendiente:{' '}
              <strong>{formatMoney(snapshot.balance_due, snapshot.currency)}</strong>. Puedes
              registrar un abono o combinar métodos en un solo envío.
            </span>
          )}
        </div>
        <ErrorNotice error={operation.error || cash.error || methods.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset
          disabled={operation.locked}
          className={`form-stack${embedded ? ' payment-controls-grid' : ''}`}
        >
          <div className={embedded ? 'payment-secondary-scroll' : 'form-stack'}>
            {embedded && (
              <div
                className="digital-payment-methods"
                role="group"
                aria-label="Métodos para el saldo"
              >
                {methods.data?.data.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={method?.id === item.id}
                    onClick={() => setChosen(item)}
                  >
                    <strong>{item.name}</strong>
                    <small>{item.kind === 'cash' ? 'Efectivo' : 'Registro manual'}</small>
                  </button>
                ))}
                {(methods.data?.meta.last_page ?? 1) > 1 && (
                  <PaymentMethodField method={method} onPick={setChosen} />
                )}
              </div>
            )}
            <PaymentOptions embedded={embedded} title="Cambiar caja">
              <Field label="Caja de la operación">
                <select
                  value={selected?.id ?? ''}
                  onChange={(event) => setCashId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Selecciona una caja abierta
                  </option>
                  {cash.data?.data.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · Sesión #{item.id}
                    </option>
                  ))}
                </select>
              </Field>
            </PaymentOptions>
            {!cash.isPending && !cash.data?.data.length && (
              <p className="notice">Necesitas una sesión abierta en esta sucursal.</p>
            )}
            <div className="payment-draft-lines">
              {lines.map((line) => (
                <div className="payment-draft-line" key={line.key}>
                  <div>
                    <strong>{line.method.name}</strong>
                    {line.account_id && (
                      <small>
                        {snapshot.accounts.find((item) => item.id === line.account_id)?.label}
                      </small>
                    )}
                    <small>
                      {line.method.kind === 'cash'
                        ? `Recibido ${formatMoney(line.received_amount, snapshot.currency)} · Cambio ${formatMoney(unitsToMoney(moneyUnits(line.received_amount) - moneyUnits(line.amount)), snapshot.currency)}`
                        : `Manual · ${line.reference}`}
                    </small>
                  </div>
                  <b>{formatMoney(line.amount, snapshot.currency)}</b>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Retirar pago ${line.method.name}`}
                    onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {remaining > 0n && (
              <>
                <PaymentOptions embedded={embedded} title="Abono o cambiar cuenta">
                  {!!snapshot.accounts.length && (
                    <Field label="Cuenta de este pago">
                      <select
                        value={account?.id ?? ''}
                        onChange={(event) => {
                          setAccountId(Number(event.target.value))
                          setAmount(null)
                          setReceived('')
                          setReference('')
                        }}
                      >
                        {accounts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · Saldo{' '}
                            {formatMoney(unitsToMoney(item.remaining), snapshot.currency)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {!embedded && <PaymentMethodField method={method} onPick={setChosen} />}
                  {(!embedded || isCash) && (
                    <Field label="Importe a agregar">
                      <input
                        value={amount ?? unitsToMoney(limit).slice(0, -2)}
                        onChange={(event) => setAmount(event.target.value)}
                        inputMode="decimal"
                      />
                    </Field>
                  )}
                </PaymentOptions>
                {isCash ? (
                  !embedded && (
                    <Field label="Efectivo recibido para este pago">
                      <input
                        value={received}
                        onChange={(event) => setReceived(event.target.value)}
                        inputMode="decimal"
                      />
                    </Field>
                  )
                ) : (
                  <Field label="Referencia del pago a agregar">
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      maxLength={120}
                    />
                  </Field>
                )}
                {!embedded && (
                  <button
                    type="button"
                    className="button secondary prepare-account-payment"
                    disabled={!ready || lines.length >= 20}
                    onClick={add}
                  >
                    <Plus size={16} />
                    {embedded ? 'Preparar pago de esta cuenta' : 'Agregar pago al lote'}
                  </button>
                )}
              </>
            )}
            {embedded && (isCash || cashLines.length > 0) ? (
              <ChangeDueDisplay
                amount={changeDue}
                currency={snapshot.currency}
                prepared={cashLines.length > 0}
              />
            ) : (
              <div className="checkout-change">
                <span>Pagos preparados</span>
                <strong>{formatMoney(unitsToMoney(total), snapshot.currency)}</strong>
              </div>
            )}
            <p className="muted small">
              Saldo después del envío: {formatMoney(unitsToMoney(remaining), snapshot.currency)}.
              Solo los importes de efectivo cambian el saldo de caja.
            </p>
            {embedded && isCash && remaining > 0n && (
              <div className="digital-cash-shortcuts">
                <button
                  type="button"
                  disabled={!amountValid}
                  onClick={() => setReceived(normalized)}
                >
                  Exacto
                </button>
                {snapshot.currency === 'COP' &&
                  ['20000', '50000', '100000'].map((value) => (
                    <button type="button" key={value} onClick={() => setReceived(value)}>
                      {formatMoney(value, snapshot.currency)}
                    </button>
                  ))}
              </div>
            )}
          </div>
          {embedded && (
            <fieldset
              className="payment-tender-dock"
              disabled={remaining <= 0n || operation.locked}
            >
              {isCash && (
                <Field label="Efectivo recibido para este pago">
                  <input
                    value={received}
                    onChange={(event) => setReceived(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
              )}
              {isCash && (
                <>
                  <CashTenderKeypad value={received} onChange={setReceived} />
                  <div className="checkout-change">
                    <span>Cambio a entregar</span>
                    <strong>
                      {validMoney(tendered) &&
                      amountValid &&
                      moneyUnits(tendered) >= moneyUnits(normalized)
                        ? formatMoney(
                            unitsToMoney(moneyUnits(tendered) - moneyUnits(normalized)),
                            snapshot.currency,
                          )
                        : '—'}
                    </strong>
                  </div>
                </>
              )}

              {!isCash && (
                <>
                  <Field label="Importe a agregar">
                    <input
                      value={amount ?? unitsToMoney(limit).slice(0, -2)}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                    />
                  </Field>
                  <CashTenderKeypad
                    label="Importe"
                    value={amount ?? unitsToMoney(limit).slice(0, -2)}
                    onChange={setAmount}
                  />
                </>
              )}
            </fieldset>
          )}
        </fieldset>
        {operation.error instanceof ApiError && operation.error.status === 409 && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void client.invalidateQueries({ queryKey: ['sale', snapshot.id] })
              onClose()
            }}
          >
            Revisar saldo actual y descartar este lote
          </button>
        )}
        <div className="form-actions">
          {embedded && remaining > 0n && (
            <button
              type="button"
              className="button secondary prepare-account-payment"
              disabled={!ready || lines.length >= 20 || operation.locked}
              onClick={add}
            >
              Preparar pago de esta cuenta
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={operation.locked}
            onClick={onClose}
          >
            Volver
          </button>
          <Submit
            pending={operation.isPending}
            disabled={!operation.uncertain && (!lines.length || !selected)}
          >
            {operation.uncertain
              ? embedded
                ? 'Reintentar pagos'
                : 'Reintentar lote de pagos'
              : embedded
                ? 'Confirmar pagos preparados'
                : 'Confirmar lote de pagos'}
          </Submit>
        </div>
      </form>
    </PaymentContainer>
  )
}

function PaymentContainer({
  embedded,
  children,
  title,
  onClose,
}: {
  embedded: boolean
  children: import('react').ReactNode
  title: string
  onClose: () => void
}) {
  return embedded ? (
    <section className="panel pending-payment-panel" aria-label="Cobrar saldo pendiente">
      <h3>{title}</h3>
      {children}
    </section>
  ) : (
    <Modal title={title} onClose={onClose}>
      {children}
    </Modal>
  )
}

function PaymentOptions({
  embedded,
  children,
  title,
}: {
  embedded: boolean
  children: import('react').ReactNode
  title: string
}) {
  return embedded ? (
    <details className="digital-payment-options">
      <summary>{title}</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  )
}
