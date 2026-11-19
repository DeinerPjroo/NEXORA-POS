import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Modal } from '../../components/ui'
import type { CatalogPage } from '../catalog/types'
import { Pagination } from '../catalog/catalog-ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { DiningSession, TableChoice } from './session-types'

export function SessionEditor({
  branchId,
  session,
  initialTable,
  onClose,
  onSaved,
}: {
  branchId: number
  session?: DiningSession
  initialTable?: TableChoice
  onClose: () => void
  onSaved?: (session: DiningSession) => void
}) {
  const client = useQueryClient()
  const fixedTable = session ? undefined : initialTable
  const [page, setPage] = useState(1)
  const [staffPage, setStaffPage] = useState(1)
  const [selected, setSelected] = useState<TableChoice[]>(() =>
    session
      ? session.tables
          .filter((t) => !t.released_at)
          .map((t) => ({
            id: t.dining_table_id,
            name: t.table_name,
            capacity: t.capacity,
            revision: t.table_revision,
          }))
      : initialTable
        ? [initialTable]
        : [],
  )
  const [waiter, setWaiter] = useState(session?.waiter_id ? String(session.waiter_id) : '')
  const choices = useQuery({
    enabled: !fixedTable,
    queryKey: ['dining-available', branchId, session?.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<TableChoice>>(
        'dining/available-tables?branch_id=' +
          branchId +
          '&page=' +
          page +
          (session ? '&session_id=' + session.id : ''),
        { signal },
      ),
  })
  const staff = useQuery({
    queryKey: ['dining-waiters', staffPage],
    queryFn: ({ signal }) =>
      api<CatalogPage<{ id: number; name: string }>>('dining/waiters?page=' + staffPage, {
        signal,
      }),
  })
  const operation = useOperation<DiningSession>(
    'dining-sessions' + (session ? '/' + session.id : ''),
    async (saved) => {
      await Promise.all(
        ['dining-occupancy', 'dining-sessions', 'dining-session', 'dining-available'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      onClose()
      onSaved?.(saved)
    },
    session ? 'PUT' : 'POST',
  )
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const data = new FormData(e.currentTarget)
    operation.send({
      ...(session ? { revision: session.revision } : { branch_id: branchId }),
      tables: (fixedTable ? [fixedTable] : selected).map((t) => ({
        id: t.id,
        revision: t.revision,
      })),
      guest_count: Number(data.get('guest_count')),
      waiter_id: waiter ? Number(waiter) : null,
      notes: data.get('notes'),
    })
  }
  const currentStaff = staff.data?.data.some((s) => String(s.id) === waiter)
  return (
    <Modal
      title={session ? 'Editar atención #' + session.id : 'Ocupar mesas'}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || choices.error || staff.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Personas en la atención">
            <input
              name="guest_count"
              type="number"
              min={1}
              max={fixedTable ? Math.min(100, fixedTable.capacity) : 100}
              required
              defaultValue={session?.guest_count ?? Math.min(2, fixedTable?.capacity ?? 2)}
            />
          </Field>
          {fixedTable && (
            <div className="notice">
              <strong>Mesa seleccionada: {fixedTable.name}</strong>
              <p>
                Capacidad: {fixedTable.capacity} personas. La mesa completa queda ocupada para esta
                atención, aunque sobren sillas.
              </p>
            </div>
          )}
          {!fixedTable && (
            <>
              <p className="muted">
                Seleccionadas: {selected.map((t) => t.name).join(', ') || 'ninguna'} · Capacidad{' '}
                {selected.reduce((sum, t) => sum + t.capacity, 0)}. Marca varias mesas para unirlas;
                desmárcalas para separarlas.
              </p>
              {selected
                .filter((t) => !choices.data?.data.some((c) => c.id === t.id))
                .map((t) => (
                  <label className="checkbox-line" key={t.id}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => setSelected((values) => values.filter((v) => v.id !== t.id))}
                    />
                    {t.name} · {t.capacity} plazas
                  </label>
                ))}
              {choices.data?.data.map((t) => (
                <label className="checkbox-line" key={t.id}>
                  <input
                    type="checkbox"
                    checked={selected.some((s) => s.id === t.id)}
                    onChange={(e) =>
                      setSelected((values) =>
                        e.target.checked ? [...values, t] : values.filter((v) => v.id !== t.id),
                      )
                    }
                  />
                  {t.name} · {t.room_name} · {t.capacity} plazas
                </label>
              ))}
              {choices.data && (
                <Pagination
                  meta={choices.data.meta}
                  onPage={setPage}
                  pending={choices.isFetching}
                />
              )}
            </>
          )}
          <Field label="Mesero asignado">
            <select value={waiter} onChange={(e) => setWaiter(e.target.value)}>
              <option value="">Sin asignar</option>
              {waiter && !currentStaff && (
                <option value={waiter}>{session?.waiter_name ?? 'Mesero seleccionado'}</option>
              )}
              {staff.data?.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {staff.data && staff.data.meta.last_page > 1 && (
            <Pagination meta={staff.data.meta} onPage={setStaffPage} pending={staff.isFetching} />
          )}
          <Field label="Notas de la atención">
            <textarea name="notes" maxLength={300} defaultValue={session?.notes ?? ''} />
          </Field>
        </fieldset>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={operation.locked}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={operation.isPending || (!operation.uncertain && !selected.length)}
          >
            {operation.uncertain ? 'Reintentar misma atención' : 'Guardar atención'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
