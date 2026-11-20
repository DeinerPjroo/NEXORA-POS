import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, PageTitle, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'

type Station = {
  id: number
  branch_id: number
  name: string
  color: string
  target_minutes: number
  is_active: boolean
  revision: number
  branch: { id: number; name: string; is_active: boolean }
}

export function StationsPage() {
  const can = useCan()
  const [editing, setEditing] = useState<Station | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [branch, setBranch] = useState('')
  const [page, setPage] = useState(1)
  const context = useOperationContext()
  const params = new URLSearchParams({ search, status, page: String(page), per_page: '12' })
  if (branch) params.set('branch_id', branch)
  const query = useQuery({
    queryKey: ['kitchen-stations', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<Station>>('kitchen-stations?' + params, { signal }),
  })
  return (
    <>
      <PageTitle
        eyebrow="NEXORA KITCHEN"
        title="Estaciones de cocina"
        description="Organiza las áreas de preparación y sus tiempos objetivo por sucursal."
        action={
          can('kitchen.manage') && (
            <button className="button primary" onClick={() => setEditing('new')}>
              Nueva estación
            </button>
          )
        }
      />
      <div className="operation-toolbar">
        <Link className="button secondary" to="/terminal/cocina">
          Abrir cocina
        </Link>
        {can('kitchen.manage') && can('catalog.view') && (
          <Link className="button secondary" to="/cocina/rutas">
            Rutas de preparación
          </Link>
        )}
        <input
          aria-label="Buscar estaciones"
          placeholder="Buscar estación…"
          maxLength={80}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Sucursal de estaciones"
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
          aria-label="Estado de estaciones"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="active">Activas</option>
          <option value="archived">Archivadas</option>
          <option value="">Todas</option>
        </select>
      </div>
      <ErrorNotice error={query.error || context.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="branch-grid">
            {query.data?.data.map((station) => (
              <article className="panel branch-card" key={station.id}>
                <div style={{ height: 6, borderRadius: 8, backgroundColor: station.color }} />
                <h2>{station.name}</h2>
                <p>{station.branch.name}</p>
                <p>Tiempo objetivo: {station.target_minutes} min</p>
                <p className="muted">
                  {station.is_active ? 'Estación activa' : 'Estación archivada'}
                  {!station.branch.is_active && ' · Sucursal inactiva'}
                </p>
                {can('kitchen.manage') && (
                  <button
                    className="button secondary"
                    aria-label={'Editar estación ' + station.name}
                    onClick={() => setEditing(structuredClone(station))}
                  >
                    Editar estación
                  </button>
                )}
              </article>
            ))}
          </div>
          {query.data?.data.length === 0 && (
            <div className="panel empty-state">
              <h2>No hay estaciones para estos filtros</h2>
              <p>Configura las áreas de preparación de tu restaurante.</p>
            </div>
          )}
          {query.data && (
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          )}
        </>
      )}
      {editing && (
        <StationEditor
          station={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function StationEditor({ station, onClose }: { station: Station | null; onClose: () => void }) {
  const context = useOperationContext()
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<Station>(
    'kitchen-stations' + (station ? '/' + station.id : ''),
    async () => {
      await client.invalidateQueries({ queryKey: ['kitchen-stations'] })
      toast('Estación guardada.')
      onClose()
    },
    station ? 'PUT' : 'POST',
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
      target_minutes: Number(data.get('target_minutes')),
      is_active: data.get('is_active') === 'on',
      ...(station ? { revision: station.revision } : { branch_id: Number(data.get('branch_id')) }),
    })
  }
  return (
    <Modal
      title={station ? 'Editar estación' : 'Nueva estación'}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || context.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Nombre de la estación">
            <input name="name" required maxLength={80} defaultValue={station?.name} autoFocus />
          </Field>
          {!station && (
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
          <Field label="Tiempo objetivo en minutos">
            <input
              name="target_minutes"
              type="number"
              required
              min={1}
              max={1440}
              step={1}
              defaultValue={station?.target_minutes ?? 15}
            />
          </Field>
          <Field label="Color de la estación">
            <input name="color" type="color" defaultValue={station?.color ?? '#8271ff'} />
          </Field>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={station?.is_active ?? true} />
            Estación activa
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
            {operation.uncertain ? 'Reintentar mismo guardado' : 'Guardar estación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
