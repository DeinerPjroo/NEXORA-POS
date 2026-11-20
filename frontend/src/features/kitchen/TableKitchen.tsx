import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Modal, Field, ErrorNotice, Loading, Submit } from '../../components/ui'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { KitchenTicket } from './types'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'

export const preparationLabels = { table: 'Servir en mesa', takeaway: 'Empacar · Para llevar' }
export function TableKitchen({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['table-kitchen', sessionId, page],
    queryFn: () =>
      api<CatalogPage<KitchenTicket>>(`dining-sessions/${sessionId}/kitchen-tickets?page=${page}`),
    refetchInterval: 5000,
  })
  const labels = {
    new: 'Nueva',
    preparing: 'En preparación',
    ready: 'Lista',
    delivered: 'Entregada',
    cancelled: 'Cancelada',
  }
  return (
    <Modal title="Comandas de esta mesa" onClose={onClose}>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div className="table-kitchen-history">
          {query.data?.data.length === 0 && (
            <p>No se han enviado productos a cocina en esta atención.</p>
          )}
          {query.data?.data.map((t) => (
            <article className="panel" key={t.id}>
              <strong>
                Comanda #{t.id} · {t.station_name} · {labels[t.status]}
              </strong>
              <ul>
                {t.lines.map((l) => (
                  <li key={l.id}>
                    {l.quantity} × {l.product_name} ·{' '}
                    <strong>{preparationLabels[l.preparation_destination ?? 'table']}</strong>
                    {l.corrections?.map((c) => (
                      <p key={c.id}>Corrección: {c.reason}</p>
                    ))}
                  </li>
                ))}
              </ul>
              <details>
                <summary>Historial de la comanda</summary>
                {t.events?.map((e) => (
                  <p key={e.id}>
                    {new Date(e.created_at).toLocaleString('es-CO')} ·{' '}
                    {labels[e.to_status as keyof typeof labels]}
                    {e.reason && ` · ${e.reason}`}
                  </p>
                ))}
              </details>
            </article>
          ))}
        </div>
      )}
      {query.data && (
        <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
      )}
    </Modal>
  )
}
export function CorrectPreparation({
  orderId,
  revision,
  itemIds,
  onClose,
}: {
  orderId: number
  revision: number
  itemIds: number[]
  onClose: () => void
}) {
  const client = useQueryClient()
  const operation = useOperation(`orders/${orderId}/preparation-corrections`, async () => {
    await Promise.all(
      ['orders', 'order', 'table-active-order', 'kitchen-tickets', 'table-kitchen'].map((k) =>
        client.invalidateQueries({ queryKey: [k] }),
      ),
    )
    onClose()
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    operation.send({
      order_revision: revision,
      item_ids: itemIds,
      destination: f.get('destination'),
      reason: f.get('reason'),
    })
  }
  return (
    <Modal title="Corregir destino registrado" onClose={onClose} locked={operation.locked}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Nuevo destino">
            <select name="destination">
              <option value="table">Para mesa</option>
              <option value="takeaway">Para llevar</option>
            </select>
          </Field>
          <Field label="Motivo de la corrección">
            <textarea name="reason" required minLength={3} maxLength={250} />
          </Field>
          <p>
            La corrección quedará en el historial y en cocina. No cambia cantidades ni importes.
          </p>
        </fieldset>
        {operation.uncertain ? (
          <button type="button" className="button primary" onClick={() => operation.send({})}>
            Reintentar misma corrección
          </button>
        ) : (
          <Submit pending={operation.isPending}>Registrar corrección</Submit>
        )}
      </form>
    </Modal>
  )
}
