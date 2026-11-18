import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Loading, Modal, Submit } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { OperationNotice } from '../operations/OperationNotice'
import { CatalogError, Pagination } from './catalog-ui'
import { AvailabilityWindowEditor } from './AvailabilityWindowEditor'
import { useAvailabilityWrite } from './useAvailabilityWrite'
import { weekdays } from './availability-types'
import type { AvailabilityContext, AvailabilityWindow } from './availability-types'
import type { CatalogPage, Product } from './types'

function AvailabilityPolicyEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const { session } = useSession()
  const [snapshot] = useState({
    revision: product.revision,
    currency: session!.company.currency,
    timezone: product.availability_context?.timezone ?? session!.company.timezone,
  })
  const operation = useAvailabilityWrite(
    `products/${product.id}/availability-policy`,
    true,
    onClose,
  )
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  function close() {
    if (conflict) void operation.refresh()
    onClose()
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    operation.send({
      product_revision: snapshot.revision,
      currency: snapshot.currency,
      expected_timezone: snapshot.timezone,
      enabled: new FormData(event.currentTarget).get('enabled') === 'on',
    })
  }
  return (
    <Modal title={`Configurar horario · ${product.name}`} onClose={close}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <p className="muted small">Zona al abrir: {snapshot.timezone}.</p>
          <label className="checkbox-line">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={product.availability_schedule_enabled ?? false}
            />
            <span>Aplicar ventanas de disponibilidad</span>
          </label>
          <p>
            Al habilitarlo, el producto solo estará disponible dentro de alguna ventana activa. Sin
            ventanas activas quedará fuera de horario. Deshabilitarlo conserva las ventanas para
            usarlas después.
          </p>
          <p className="muted small">
            La disponibilidad manual, categoría, presentaciones e impuestos siguen aplicándose. Los
            pedidos guardados conservan su historia.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">La ficha cambió. Cierra y vuelve a abrir con su revisión actual.</p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cerrar
          </button>
          <Submit pending={operation.isPending} disabled={conflict && !operation.uncertain}>
            {operation.uncertain ? 'Reintentar horario' : 'Guardar horario'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}

export function AvailabilityPanel({ product }: { product: Product }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<AvailabilityWindow | 'new' | null>(null)
  const [policy, setPolicy] = useState(false)
  const can = useCan()
  const client = useQueryClient()
  const params = new URLSearchParams({ page: String(page), per_page: '10' })
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['availability-windows', product.id, params.toString()],
    queryFn: ({ signal }) =>
      api<
        CatalogPage<AvailabilityWindow> & {
          product_revision: number
          enabled: boolean
          availability_context: AvailabilityContext
        }
      >(`products/${product.id}/availability-windows?${params}`, { signal }),
  })
  const current = query.data?.product_revision === product.revision
  return (
    <section className="panel variants-panel">
      <div className="panel-heading">
        <h2>Horarios de disponibilidad</h2>
        {can('catalog.manage') && (
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={!current}
              onClick={() => setPolicy(true)}
            >
              Configurar horario
            </button>
            <button
              className="button primary"
              disabled={!current}
              onClick={() => setEditing('new')}
            >
              Nueva ventana
            </button>
          </div>
        )}
      </div>
      <p className="muted small">
        Hasta 28 ventanas activas por producto; las presentaciones las heredan. La zona empresarial
        actual también se aplica a las ventanas futuras.
      </p>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <p>
            <strong>{query.data.enabled ? 'Horario habilitado' : 'Horario deshabilitado'}</strong> ·{' '}
            {query.data.availability_context.timezone} ·{' '}
            {query.data.availability_context.allowed
              ? 'Sin bloqueo de horario al consultar'
              : 'Fuera del horario de disponibilidad'}
          </p>
          <p className="muted small">
            El servidor comprueba nuevamente la hora real al registrar el pedido. Un horario abierto
            no reemplaza la disponibilidad manual.
          </p>
          {!current && (
            <p className="notice">
              La ficha cambió.{' '}
              <button
                className="text-button"
                onClick={() => {
                  void client.invalidateQueries({ queryKey: ['product', product.id] })
                  void query.refetch()
                }}
              >
                Actualizar ficha
              </button>
            </p>
          )}
          <label className="field">
            <span>Estado de ventanas</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setPage(1)
              }}
            >
              <option value="">Todas</option>
              <option value="active">Activas</option>
              <option value="inactive">Archivadas</option>
            </select>
          </label>
          {query.data.data.length ? (
            <div className="table-scroll">
              <table className="variant-table">
                <thead>
                  <tr>
                    <th>Ventana</th>
                    <th>Día y horas</th>
                    <th>Vigencia del inicio</th>
                    <th>Estado</th>
                    {can('catalog.manage') && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((window) => (
                    <tr key={window.id}>
                      <td>{window.name}</td>
                      <td>
                        {weekdays[window.weekday - 1]}
                        <small>
                          {window.start_time} → {window.end_time}
                          {window.ends_next_day ? ' · Día siguiente' : ''}
                        </small>
                      </td>
                      <td>
                        {window.valid_from ?? 'Sin inicio'} / {window.valid_until ?? 'Sin final'}
                      </td>
                      <td>{window.is_active ? 'Activa' : 'Archivada'}</td>
                      {can('catalog.manage') && (
                        <td>
                          <button
                            className="text-button"
                            disabled={!current}
                            aria-label={`Editar ventana ${window.name}`}
                            onClick={() => setEditing(window)}
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-inline muted">Sin ventanas registradas.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <AvailabilityWindowEditor
          product={product}
          window={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {policy && <AvailabilityPolicyEditor product={product} onClose={() => setPolicy(false)} />}
    </section>
  )
}
