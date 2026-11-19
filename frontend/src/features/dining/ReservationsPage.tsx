import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Modal, Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { TableChoice } from './session-types'
import { instantChoice, localMinute, reservationTimes } from './reservation-time'
import './dining.css'

type Reservation = {
  id: number
  branch_id: number
  branch_name: string
  guest_name: string
  phone: string | null
  guest_count: number
  notes: string | null
  status: 'booked' | 'arrived' | 'cancelled' | 'no_show'
  booking_timezone: string
  starts_at: string
  ends_at: string
  revision: number
  dining_session_id: number | null
  tables: {
    dining_table_id: number
    table_name: string
    table_revision: number
    capacity: number
  }[]
}
const states = {
  booked: 'Pendiente',
  arrived: 'Llegó',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
}
export function ReservationsPage() {
  const can = useCan()
  const context = useOperationContext()
  const [params] = useSearchParams()
  const [branch, setBranch] = useState(params.get('branch') ?? '')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('booked')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null)
  const [changing, setChanging] = useState<{
    reservation: Reservation
    status: 'arrived' | 'cancelled' | 'no_show'
  } | null>(null)
  const filters = new URLSearchParams({ page: String(page) })
  if (branch) filters.set('branch_id', branch)
  if (date) filters.set('date', date)
  if (status) filters.set('status', status)
  const query = useQuery({
    queryKey: ['dining-reservations', filters.toString()],
    queryFn: ({ signal }) =>
      api<CatalogPage<Reservation>>('dining-reservations?' + filters, { signal }),
    refetchInterval: 30000,
  })
  return (
    <>
      <PageTitle
        eyebrow="UN LUGAR PARA CADA ENCUENTRO"
        title="Reservas de mesas"
        description="Agenda por sucursal, comprueba capacidad y registra la llegada cuando el grupo esté presente."
        action={
          <button className="button primary" onClick={() => setEditing('new')}>
            Nueva reserva
          </button>
        }
      />
      <div className="operation-toolbar dining-filters">
        <select
          aria-label="Sucursal de reservas"
          value={branch}
          onChange={(e) => {
            setBranch(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todas las sucursales</option>
          {context.data?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Fecha de reservas"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Estado de reservas"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(states).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={query.error || context.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <section className="panel dining-layout">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Horario</th>
                  <th>Mesas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.guest_name}</strong>
                      <p>
                        {r.guest_count} personas · {r.branch_name}
                      </p>
                      {r.phone && <p>{r.phone}</p>}
                    </td>
                    <td>
                      {new Date(r.starts_at).toLocaleString('es-CO', {
                        timeZone: r.booking_timezone,
                      })}
                      <p>
                        Hasta{' '}
                        {new Date(r.ends_at).toLocaleString('es-CO', {
                          timeZone: r.booking_timezone,
                        })}
                      </p>
                      <small>{r.booking_timezone}</small>
                    </td>
                    <td>{r.tables.map((t) => t.table_name).join(', ')}</td>
                    <td>{states[r.status]}</td>
                    <td>
                      <div className="form-stack">
                        {r.status === 'booked' && (
                          <>
                            <button
                              className="text-button"
                              onClick={() => setEditing(structuredClone(r))}
                              aria-label={'Editar reserva de ' + r.guest_name}
                            >
                              Editar
                            </button>
                            {can('dining.operate') && (
                              <button
                                className="button primary"
                                onClick={() =>
                                  setChanging({
                                    reservation: structuredClone(r),
                                    status: 'arrived',
                                  })
                                }
                                aria-label={'Registrar llegada de ' + r.guest_name}
                              >
                                Registrar llegada
                              </button>
                            )}
                            <button
                              className="text-button"
                              onClick={() =>
                                setChanging({
                                  reservation: structuredClone(r),
                                  status: 'cancelled',
                                })
                              }
                              aria-label={'Cancelar reserva de ' + r.guest_name}
                            >
                              Cancelar
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                setChanging({ reservation: structuredClone(r), status: 'no_show' })
                              }
                              aria-label={'Marcar inasistencia de ' + r.guest_name}
                            >
                              No asistió
                            </button>
                          </>
                        )}
                        {r.dining_session_id && can('dining.view') && (
                          <Link
                            className="text-button"
                            to={'/salones/atenciones/' + r.dining_session_id}
                          >
                            Ver atención #{r.dining_session_id}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data?.data.length === 0 && (
            <p className="empty-state">No hay reservas en esta vista.</p>
          )}
          {query.data && (
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          )}
        </section>
      )}
      {editing && (
        <ReservationEditor
          reservation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {changing && (
        <ReservationState
          reservation={changing.reservation}
          status={changing.status}
          onClose={() => setChanging(null)}
        />
      )}
    </>
  )
}
function TimeField({
  label,
  value,
  choice,
  timezone,
  onChange,
  onChoice,
}: {
  label: string
  value: string
  choice: string
  timezone: string
  onChange: (v: string) => void
  onChoice: (v: string) => void
}) {
  const choices = reservationTimes(value, timezone)
  return (
    <>
      <Field label={label}>
        <input
          type="datetime-local"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      {value && choices.length === 0 && (
        <p className="notice error">Este horario no existe en {timezone}. Elige otro horario.</p>
      )}
      {choices.length > 1 && (
        <Field
          label={'Desplazamiento para ' + label.toLocaleLowerCase('es')}
          hint="El cambio de hora repite este horario. Selecciona cuál deseas reservar."
        >
          <select
            required
            value={choices.includes(choice) ? choice : ''}
            onChange={(e) => onChoice(e.target.value)}
          >
            <option value="">Selecciona el desplazamiento</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                UTC{c.slice(-6)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  )
}
function ReservationEditor({
  reservation,
  onClose,
}: {
  reservation: Reservation | null
  onClose: () => void
}) {
  const { session } = useSession()
  const [timezone] = useState(session!.company.timezone)
  const [branch, setBranch] = useState(reservation?.branch_id ? String(reservation.branch_id) : '')
  const context = useOperationContext()
  const [page, setPage] = useState(1)
  const [start, setStart] = useState(() =>
    localMinute(reservation?.starts_at ?? Date.now() + 3600000, timezone),
  )
  const [end, setEnd] = useState(() =>
    localMinute(reservation?.ends_at ?? Date.now() + 7200000, timezone),
  )
  const [startChoice, setStartChoice] = useState(() =>
    reservation ? instantChoice(reservation.starts_at, timezone) : '',
  )
  const [endChoice, setEndChoice] = useState(() =>
    reservation ? instantChoice(reservation.ends_at, timezone) : '',
  )
  const [selected, setSelected] = useState<TableChoice[]>(
    () =>
      reservation?.tables.map((t) => ({
        id: t.dining_table_id,
        name: t.table_name,
        revision: t.table_revision,
        capacity: t.capacity,
      })) ?? [],
  )
  const choices = useQuery({
    queryKey: ['dining-reservation-tables', branch, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<TableChoice>>(
        'dining/reservation-tables?branch_id=' + branch + '&page=' + page,
        { signal },
      ),
    enabled: !!branch,
  })
  const client = useQueryClient()
  const operation = useOperation<Reservation>(
    'dining-reservations' + (reservation ? '/' + reservation.id : ''),
    async () => {
      await client.invalidateQueries({ queryKey: ['dining-reservations'] })
      onClose()
    },
    reservation ? 'PUT' : 'POST',
  )
  function time(local: string, chosen: string) {
    const options = reservationTimes(local, timezone)
    return options.length === 1 ? options[0] : options.includes(chosen) ? chosen : null
  }
  const startISO = time(start, startChoice),
    endISO = time(end, endChoice)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const data = new FormData(e.currentTarget)
    operation.send({
      ...(reservation ? { revision: reservation.revision } : { branch_id: Number(branch) }),
      expected_timezone: timezone,
      guest_name: data.get('guest_name'),
      phone: data.get('phone'),
      guest_count: Number(data.get('guest_count')),
      notes: data.get('notes'),
      starts_at: startISO,
      ends_at: endISO,
      tables: selected.map((t) => ({ id: t.id, revision: t.revision })),
    })
  }
  return (
    <Modal
      title={reservation ? 'Editar reserva' : 'Nueva reserva'}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || choices.error || context.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Nombre de quien reserva">
            <input
              name="guest_name"
              required
              maxLength={100}
              defaultValue={reservation?.guest_name}
              autoFocus
            />
          </Field>
          <div className="form-grid">
            <Field label="Teléfono de contacto">
              <input
                name="phone"
                type="tel"
                maxLength={30}
                defaultValue={reservation?.phone ?? ''}
              />
            </Field>
            <Field label="Personas de la reserva">
              <input
                name="guest_count"
                type="number"
                min={1}
                max={100}
                required
                defaultValue={reservation?.guest_count ?? 2}
              />
            </Field>
          </div>
          <Field label="Sucursal de la reserva">
            <select
              required
              disabled={!!reservation}
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value)
                setSelected([])
                setPage(1)
              }}
            >
              <option value="">Selecciona una sucursal</option>
              {context.data?.branches
                .filter((b) => b.is_active || b.id === reservation?.branch_id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted">
            Horarios de {timezone} · Duración de 15 minutos a 12 horas. La disponibilidad se
            confirma al guardar.
          </p>
          <TimeField
            label="Inicio de la reserva"
            value={start}
            choice={startChoice}
            timezone={timezone}
            onChange={(v) => {
              setStart(v)
              setStartChoice('')
            }}
            onChoice={setStartChoice}
          />
          <TimeField
            label="Fin de la reserva"
            value={end}
            choice={endChoice}
            timezone={timezone}
            onChange={(v) => {
              setEnd(v)
              setEndChoice('')
            }}
            onChoice={setEndChoice}
          />
          <p className="muted">
            Mesas: {selected.map((t) => t.name).join(', ') || 'ninguna'} · Capacidad{' '}
            {selected.reduce((s, t) => s + t.capacity, 0)}
          </p>
          {selected
            .filter((t) => !choices.data?.data.some((c) => c.id === t.id))
            .map((t) => (
              <label className="checkbox-line" key={t.id}>
                <input
                  type="checkbox"
                  checked
                  onChange={() => setSelected((v) => v.filter((t2) => t2.id !== t.id))}
                />
                {t.name}
              </label>
            ))}
          {choices.data?.data.map((t) => (
            <label className="checkbox-line" key={t.id}>
              <input
                type="checkbox"
                checked={selected.some((s) => s.id === t.id)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked ? [...v, t] : v.filter((s) => s.id !== t.id),
                  )
                }
              />
              {t.name} · {t.room_name} · {t.capacity} plazas
            </label>
          ))}
          {choices.data && (
            <Pagination meta={choices.data.meta} pending={choices.isFetching} onPage={setPage} />
          )}
          <Field label="Notas de la reserva">
            <textarea name="notes" maxLength={300} defaultValue={reservation?.notes ?? ''} />
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
            disabled={
              operation.isPending ||
              (!operation.uncertain && (!startISO || !endISO || !selected.length))
            }
          >
            {operation.uncertain ? 'Reintentar misma reserva' : 'Guardar reserva'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
function ReservationState({
  reservation,
  status,
  onClose,
}: {
  reservation: Reservation
  status: 'arrived' | 'cancelled' | 'no_show'
  onClose: () => void
}) {
  const client = useQueryClient()
  const [staffPage, setStaffPage] = useState(1)
  const staff = useQuery({
    queryKey: ['dining-waiters', staffPage],
    queryFn: ({ signal }) =>
      api<CatalogPage<{ id: number; name: string }>>('dining/waiters?page=' + staffPage, {
        signal,
      }),
    enabled: status === 'arrived',
  })
  const operation = useOperation<Reservation>(
    'dining-reservations/' + reservation.id + '/state',
    async () => {
      await Promise.all(
        ['dining-reservations', 'dining-occupancy', 'dining-sessions'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      onClose()
    },
  )
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    operation.send({
      revision: reservation.revision,
      status,
      ...(status === 'arrived'
        ? { waiter_id: d.get('waiter_id') ? Number(d.get('waiter_id')) : null }
        : {}),
    })
  }
  const title =
    status === 'arrived'
      ? 'Registrar llegada'
      : status === 'cancelled'
        ? 'Cancelar reserva'
        : 'Marcar inasistencia'
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <p>
          {reservation.guest_name} · {reservation.guest_count} personas.
        </p>
        <p className="muted">
          {status === 'arrived'
            ? 'La llegada ocupa las mesas. Disponible desde 30 minutos antes del inicio hasta el fin; si siguen ocupadas, primero resuelve la atención anterior.'
            : status === 'cancelled'
              ? 'Se libera el horario reservado y se conserva el historial.'
              : 'La inasistencia se registra cuando termina el horario reservado.'}
        </p>
        <ErrorNotice error={operation.error || staff.error} />
        <OperationNotice uncertain={operation.uncertain} />
        {status === 'arrived' && (
          <fieldset disabled={operation.locked}>
            <Field label="Mesero para la llegada">
              <select name="waiter_id">
                <option value="">Sin asignar</option>
                {staff.data?.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {staff.data && staff.data.meta.last_page > 1 && (
              <Pagination meta={staff.data.meta} pending={staff.isFetching} onPage={setStaffPage} />
            )}
          </fieldset>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={operation.locked}
            onClick={onClose}
          >
            Volver
          </button>
          <button className="button primary" disabled={operation.isPending}>
            {operation.uncertain
              ? 'Reintentar mismo cambio'
              : status === 'arrived'
                ? 'Confirmar llegada'
                : status === 'cancelled'
                  ? 'Confirmar cancelación'
                  : 'Confirmar inasistencia'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
