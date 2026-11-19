import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, PageTitle, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { DiningRoom, DiningTable } from './types'
import { LayoutEditor } from './LayoutEditor'
import './dining.css'

export function RoomsPage() {
  const can = useCan()
  const context = useOperationContext()
  const [search, setSearch] = useState('')
  const [branch, setBranch] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<DiningRoom | 'new' | null>(null)
  const params = new URLSearchParams({ page: String(page), per_page: '12', search })
  if (branch) params.set('branch_id', branch)
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['dining-rooms', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<DiningRoom>>('dining-rooms?' + params, { signal }),
  })
  return (
    <>
      <PageTitle
        eyebrow="CADA MESA TIENE SU LUGAR"
        title="Salones y mesas"
        description="Organiza los espacios de cada sucursal y guarda su distribución."
        action={
          can('dining.manage') && (
            <button className="button primary" onClick={() => setEditing('new')}>
              Nuevo salón
            </button>
          )
        }
      />
      <div className="operation-toolbar dining-filters">
        <input
          aria-label="Buscar salones"
          placeholder="Buscar salón…"
          maxLength={80}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Sucursal de salones"
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
        <select
          aria-label="Estado de salones"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="active">Activos</option>
          <option value="archived">Archivados</option>
          <option value="">Todos</option>
        </select>
      </div>
      <ErrorNotice error={query.error || context.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="branch-grid">
            {query.data?.data.map((room) => (
              <article className="panel branch-card" key={room.id}>
                <div className="dining-swatch" style={{ backgroundColor: room.color }} />
                <h2>{room.name}</h2>
                <p>{room.branch.name}</p>
                <p className="muted">
                  {room.is_active ? 'Salón activo' : 'Salón archivado'}
                  {!room.branch.is_active && ' · Sucursal inactiva'}
                </p>
                <div className="form-actions">
                  <Link className="button primary" to={'/salones/' + room.id}>
                    Ver mesas y plano
                  </Link>
                  {can('dining.manage') && (
                    <button className="button secondary" onClick={() => setEditing(room)}>
                      Editar salón
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {query.data?.data.length === 0 && (
            <div className="empty-state">
              <h2>Aún no hay salones en esta vista</h2>
              <p>Crea un salón o ajusta los filtros.</p>
            </div>
          )}
          {query.data && (
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          )}
        </>
      )}
      {editing && (
        <RoomEditor room={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function RoomEditor({ room, onClose }: { room: DiningRoom | null; onClose: () => void }) {
  const context = useOperationContext()
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<DiningRoom>(
    'dining-rooms' + (room ? '/' + room.id : ''),
    async () => {
      await client.invalidateQueries({ queryKey: ['dining-rooms'] })
      toast('Salón guardado.')
      onClose()
    },
    room ? 'PUT' : 'POST',
  )
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const data = new FormData(event.currentTarget)
    operation.send({
      name: data.get('name'),
      color: data.get('color'),
      is_active: data.get('is_active') === 'on',
      ...(room ? { revision: room.revision } : { branch_id: Number(data.get('branch_id')) }),
    })
  }
  return (
    <Modal
      title={room ? 'Editar salón' : 'Nuevo salón'}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || context.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Nombre del salón">
            <input name="name" required maxLength={80} defaultValue={room?.name} autoFocus />
          </Field>
          {!room && (
            <Field label="Sucursal">
              <select name="branch_id" required defaultValue="">
                <option value="" disabled>
                  Selecciona una sucursal
                </option>
                {context.data?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Color del plano">
            <input name="color" type="color" defaultValue={room?.color ?? '#F5F7FB'} />
          </Field>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={room?.is_active ?? true} />
            Salón activo
          </label>
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
          <button className="button primary" disabled={operation.isPending}>
            {operation.uncertain ? 'Reintentar mismo guardado' : 'Guardar salón'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function RoomDetailPage() {
  const { roomId } = useParams()
  const can = useCan()
  const client = useQueryClient()
  const [layout, setLayout] = useState(false)
  const [editing, setEditing] = useState<{ room: DiningRoom; table: DiningTable | null } | null>(
    null,
  )
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const room = useQuery({
    queryKey: ['dining-rooms', roomId],
    queryFn: ({ signal }) => api<{ data: DiningRoom }>('dining-rooms/' + roomId, { signal }),
  })
  const tables = useQuery({
    queryKey: ['dining-tables', roomId, status, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<DiningTable>>(
        'dining-rooms/' + roomId + '/tables?status=' + status + '&page=' + page,
        { signal },
      ),
  })
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['dining-rooms'] }),
      client.invalidateQueries({ queryKey: ['dining-tables', roomId] }),
    ])
  }
  if (room.isPending) return <Loading />
  if (!room.data) return <ErrorNotice error={room.error} />
  const data = room.data.data
  return (
    <>
      <Link className="text-button product-back" to="/salones">
        Volver a salones
      </Link>
      <PageTitle
        eyebrow={data.branch.name}
        title={data.name}
        description={
          (data.is_active ? 'Salón activo' : 'Salón archivado') +
          ' · Configuración del espacio y sus mesas.'
        }
        action={
          !layout &&
          can('dining.manage') && (
            <button
              className="button primary"
              onClick={() => setEditing({ room: structuredClone(data), table: null })}
            >
              Nueva mesa
            </button>
          )
        }
      />
      <ErrorNotice error={room.error || tables.error} />
      {layout ? (
        <LayoutEditor
          room={data}
          editable={can('dining.manage')}
          onSaved={refresh}
          onClose={() => setLayout(false)}
        />
      ) : (
        <>
          <div className="operation-toolbar">
            <select
              aria-label="Estado de mesas"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="active">Mesas activas</option>
              <option value="archived">Mesas archivadas</option>
              <option value="">Todas las mesas</option>
            </select>
            <button className="button secondary" onClick={() => setLayout(true)}>
              {can('dining.manage') ? 'Editar distribución' : 'Ver distribución'}
            </button>
          </div>
          <section className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mesa</th>
                    <th>Forma</th>
                    <th>Capacidad</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.data?.data.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>
                        {
                          { circle: 'Redonda', square: 'Cuadrada', rectangle: 'Rectangular' }[
                            t.shape
                          ]
                        }
                      </td>
                      <td>{t.capacity} personas</td>
                      <td>{t.is_active ? 'Activa' : 'Archivada'}</td>
                      <td>
                        {can('dining.manage') && (
                          <button
                            className="text-button"
                            aria-label={'Editar ' + t.name}
                            onClick={() =>
                              setEditing({ room: structuredClone(data), table: structuredClone(t) })
                            }
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tables.isPending && <Loading />}
            {tables.data?.data.length === 0 && (
              <p className="empty-state">No hay mesas en esta vista.</p>
            )}
            {tables.data && (
              <Pagination meta={tables.data.meta} onPage={setPage} pending={tables.isFetching} />
            )}
          </section>
        </>
      )}
      {editing && (
        <TableEditor
          room={editing.room}
          table={editing.table}
          onSaved={refresh}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function TableEditor({
  room,
  table,
  onSaved,
  onClose,
}: {
  room: DiningRoom
  table: DiningTable | null
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const operation = useOperation<DiningTable>(
    'dining-rooms/' + room.id + '/tables' + (table ? '/' + table.id : ''),
    async () => {
      await onSaved()
      onClose()
    },
    table ? 'PUT' : 'POST',
  )
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const d = new FormData(e.currentTarget)
    operation.send({
      room_revision: room.revision,
      ...(table ? { revision: table.revision } : {}),
      name: d.get('name'),
      shape: d.get('shape'),
      color: d.get('color'),
      capacity: Number(d.get('capacity')),
      is_active: d.get('is_active') === 'on',
    })
  }
  return (
    <Modal
      title={table ? 'Editar mesa' : 'Nueva mesa'}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Nombre de la mesa">
            <input name="name" required maxLength={50} defaultValue={table?.name} autoFocus />
          </Field>
          <div className="form-grid">
            <Field label="Forma">
              <select name="shape" defaultValue={table?.shape ?? 'circle'}>
                <option value="circle">Redonda</option>
                <option value="square">Cuadrada</option>
                <option value="rectangle">Rectangular</option>
              </select>
            </Field>
            <Field label="Capacidad">
              <input
                type="number"
                name="capacity"
                min={1}
                max={30}
                required
                defaultValue={table?.capacity ?? 4}
              />
            </Field>
          </div>
          <Field label="Color de la mesa">
            <input name="color" type="color" defaultValue={table?.color ?? '#DCD6FF'} />
          </Field>
          <label className="checkbox-line">
            <input type="checkbox" name="is_active" defaultChecked={table?.is_active ?? true} />
            Mesa activa
          </label>
          <p className="muted">
            Archivar conserva el registro. Cambia posición, tamaño y rotación desde el plano.
          </p>
        </fieldset>
        <div className="form-actions">
          <button
            className="button secondary"
            type="button"
            disabled={operation.locked}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={operation.isPending}>
            {operation.uncertain ? 'Reintentar mismo guardado' : 'Guardar mesa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
