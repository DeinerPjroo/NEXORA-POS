import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney, moneyUnits } from '../../lib/money'
import { ErrorNotice, Field, Loading, Modal } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { CashSession } from '../operations/types'

type Collection = {
  id: number
  order_id: number
  sale_id: number
  payment_id: number
  courier_name: string
  currency: string
  amount: string
  pending: string
  revision: number
}
export function CourierRemittances({
  branchId,
  onClose,
}: {
  branchId: number
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Collection | null>(null)
  const query = useQuery({
    queryKey: ['courier-collections', branchId, page],
    queryFn: () =>
      api<CatalogPage<Collection>>(`deliveries/collections?branch_id=${branchId}&page=${page}`),
  })
  return (
    <Modal title="Rendición de cobros de reparto" locked={!!selected} onClose={onClose}>
      <p>
        Pagos ya registrados. Rendir ingresa efectivo a caja; no vuelve a cobrar al cliente. Los
        fondos de cambio se gestionan aparte.
      </p>
      <ErrorNotice error={query.error} />
      {query.isPending && <Loading />}
      {!selected && (
        <div className="form-stack">
          {query.data?.data.map((row) => (
            <button
              key={row.id}
              disabled={moneyUnits(row.pending) === 0n}
              onClick={() => setSelected(structuredClone(row))}
            >
              Pedido #{row.order_id} · {row.courier_name} · Pendiente:{' '}
              {formatMoney(row.pending, row.currency)}
            </button>
          ))}
          {query.data?.data.length === 0 && <p>No hay cobros en custodia registrados.</p>}
          {query.data && (
            <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
          )}
        </div>
      )}
      {selected && (
        <SettleCollection
          branchId={branchId}
          collection={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Modal>
  )
}

function SettleCollection({
  branchId,
  collection,
  onClose,
}: {
  branchId: number
  collection: Collection
  onClose: () => void
}) {
  const client = useQueryClient()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [session, setSession] = useState<CashSession | null>(null)
  const sessions = useQuery({
    queryKey: ['cash-sessions', 'courier-remittance', branchId],
    queryFn: () =>
      api<CatalogPage<CashSession>>(`cash/sessions?branch_id=${branchId}&status=open&per_page=50`),
  })
  const operation = useOperation(`deliveries/collections/${collection.id}/settle`, async () => {
    await Promise.all(
      [
        'courier-collections',
        'cash-sessions',
        'cash-session',
        'cash-movements',
        'sales',
        'sale',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    onClose()
  })
  return (
    <div className="form-stack">
      <strong>
        Pedido #{collection.order_id} · {collection.courier_name}
      </strong>
      <p>Efectivo pendiente de ingresar: {formatMoney(collection.pending, collection.currency)}</p>
      <ErrorNotice error={operation.error || sessions.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <fieldset className="form-stack" disabled={operation.locked}>
        <Field label="Caja que recibe la rendición">
          <select
            value={session?.id ?? ''}
            onChange={(event) => {
              const selected = sessions.data?.data.find(
                (row) =>
                  String(row.id) === event.target.value && row.currency === collection.currency,
              )
              setSession(selected ? structuredClone(selected) : null)
              setConfirmed(false)
            }}
          >
            <option value="">Selecciona una caja abierta</option>
            {sessions.data?.data
              .filter((row) => row.currency === collection.currency)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.register_name ?? 'Caja'} · Sesión #{row.id}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Importe recibido en caja">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              setConfirmed(false)
            }}
          />
        </Field>
        <Field label="Motivo de la rendición">
          <textarea
            value={reason}
            maxLength={250}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que caja recibió físicamente este efectivo
        </label>
      </fieldset>
      <div className="form-actions">
        <button disabled={operation.locked} onClick={onClose}>
          Volver a cobros pendientes
        </button>
        <button
          className="button primary"
          disabled={
            operation.isPending ||
            (!operation.uncertain &&
              (!confirmed || !session || !amount || reason.trim().length < 3))
          }
          onClick={() =>
            operation.send({
              collection_revision: collection.revision,
              expected_pending: collection.pending.replace(/(\.\d{2})00$/, '$1'),
              amount,
              cash_session_id: session?.id,
              cash_revision: session?.revision,
              confirmed_handover: confirmed,
              reason: reason.trim(),
            })
          }
        >
          {operation.uncertain ? 'Reintentar misma rendición' : 'Confirmar ingreso a caja'}
        </button>
      </div>
    </div>
  )
}
