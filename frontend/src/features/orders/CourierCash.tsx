import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney, moneyUnits } from '../../lib/money'
import { ErrorNotice, Field, Loading, Modal } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { CashSession } from '../operations/types'
import type { CatalogPage } from '../catalog/types'

type Account = {
  courier_id: number
  name: string
  balance: string
  revision: number
  can_receive: boolean
}
type Transfer = {
  id: number
  kind: 'advance' | 'return'
  amount: string
  balance_after: string
  reason: string
  created_at: string
}

export function CourierCash({ branchId, onClose }: { branchId: number; onClose: () => void }) {
  const [selected, setSelected] = useState<Account | null>(null)
  const query = useQuery({
    queryKey: ['courier-cash', branchId],
    queryFn: () =>
      api<{ currency: string; data: Account[] }>(`deliveries/courier-cash?branch_id=${branchId}`),
  })
  return (
    <Modal title="Fondos de cambio de repartidores" locked={!!selected} onClose={onClose}>
      <p>
        Entrega o devolución física de fondos de cambio. Este flujo no registra cobros de clientes.
      </p>
      <ErrorNotice error={query.error} />
      {query.isPending && <Loading />}
      {!selected && (
        <div className="form-stack">
          {query.data?.data.map((account) => (
            <button key={account.courier_id} onClick={() => setSelected(structuredClone(account))}>
              <strong>{account.name}</strong> · En custodia:{' '}
              {formatMoney(account.balance, query.data.currency)}
            </button>
          ))}
          {query.data?.data.length === 0 && (
            <p>No hay repartidores autorizados ni fondos registrados para esta sucursal.</p>
          )}
        </div>
      )}
      {selected && query.data && (
        <CashTransfer
          branchId={branchId}
          account={selected}
          currency={query.data.currency}
          onClose={() => setSelected(null)}
        />
      )}
    </Modal>
  )
}

function CashTransfer({
  branchId,
  account,
  currency,
  onClose,
}: {
  branchId: number
  account: Account
  currency: string
  onClose: () => void
}) {
  const client = useQueryClient()
  const [kind, setKind] = useState<'advance' | 'return'>(account.can_receive ? 'advance' : 'return')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [session, setSession] = useState<CashSession | null>(null)
  const sessions = useQuery({
    queryKey: ['cash-sessions', 'courier-cash', branchId],
    queryFn: () =>
      api<CatalogPage<CashSession>>(`cash/sessions?branch_id=${branchId}&status=open&per_page=50`),
  })
  const history = useQuery({
    queryKey: ['courier-cash-history', branchId, account.courier_id],
    queryFn: () =>
      api<CatalogPage<Transfer>>(
        `deliveries/couriers/${account.courier_id}/cash?branch_id=${branchId}`,
      ),
  })
  const operation = useOperation(`deliveries/couriers/${account.courier_id}/cash`, async () => {
    await Promise.all(
      [
        'courier-cash',
        'courier-cash-history',
        'cash-sessions',
        'cash-session',
        'cash-registers',
        'cash-movements',
        'operation-context',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    onClose()
  })
  return (
    <div className="form-stack">
      <strong>
        {account.name} · Fondo en custodia: {formatMoney(account.balance, currency)}
      </strong>
      <ErrorNotice error={sessions.error || history.error || operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <fieldset className="form-stack" disabled={operation.locked}>
        <Field label="Movimiento del fondo">
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as 'advance' | 'return')
              setConfirmed(false)
            }}
          >
            <option value="advance" disabled={!account.can_receive}>
              Entregar fondo de cambio
            </option>
            <option value="return" disabled={moneyUnits(account.balance) === 0n}>
              Recibir devolución de fondo
            </option>
          </select>
        </Field>
        <Field label="Caja que entrega o recibe">
          <select
            value={session?.id ?? ''}
            onChange={(event) => {
              const selected = sessions.data?.data.find(
                (row) => String(row.id) === event.target.value && row.currency === currency,
              )
              setSession(selected ? structuredClone(selected) : null)
              setConfirmed(false)
            }}
          >
            <option value="">Selecciona una caja abierta</option>
            {sessions.data?.data
              .filter((row) => row.currency === currency)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.register_name ?? 'Caja'} · Sesión #{row.id}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Importe del fondo">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              setConfirmed(false)
            }}
            maxLength={18}
            placeholder="0.00"
          />
        </Field>
        <Field label="Motivo del traslado">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={250}
          />
        </Field>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que el efectivo se entrega o recibe físicamente
        </label>
      </fieldset>
      <div className="form-actions">
        <button disabled={operation.locked} onClick={onClose}>
          Volver a fondos
        </button>
        <button
          className="button primary"
          disabled={
            operation.isPending ||
            (!operation.uncertain &&
              (!session || !confirmed || !amount || reason.trim().length < 3))
          }
          onClick={() =>
            operation.send({
              branch_id: branchId,
              kind,
              account_revision: account.revision,
              expected_balance: account.balance,
              cash_session_id: session?.id,
              cash_revision: session?.revision,
              amount,
              reason: reason.trim(),
              confirmed_handover: confirmed,
            })
          }
        >
          {operation.uncertain ? 'Reintentar mismo traslado' : 'Confirmar traslado de efectivo'}
        </button>
      </div>
      <details>
        <summary>Historial del fondo · página cargada</summary>
        {history.data?.data.map((row) => (
          <p key={row.id}>
            #{row.id} · {row.kind === 'advance' ? 'Entregado' : 'Devuelto'}{' '}
            {formatMoney(row.amount, currency)} · Saldo: {formatMoney(row.balance_after, currency)}{' '}
            · {row.reason}
          </p>
        ))}
      </details>
    </div>
  )
}
