import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, Submit } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { OperationNotice } from '../operations/OperationNotice'
import { CatalogError, Pagination } from './catalog-ui'
import { ComboComponentEditor, useComboWrite } from './ComboComponentEditor'
import { ComboGroupsPanel } from './ComboGroupsPanel'
import { comboModes } from './combo-types'
import type { ComboComponent, ComboMode, ComboGroup } from './combo-types'
import type { CatalogPage, Product } from './types'

function ComboSettingsEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const { session } = useSession()
  const [snapshot] = useState({ revision: product.revision, currency: session!.company.currency })
  const operation = useComboWrite(`products/${product.id}/combo-settings`, true, onClose)
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
      allocation_mode: new FormData(event.currentTarget).get('allocation_mode'),
    })
  }
  return (
    <Modal title={`Reparto de precio · ${product.name}`} onClose={close}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Reparto de la base del combo">
            <select
              name="allocation_mode"
              required
              defaultValue={product.combo_allocation_mode ?? ''}
            >
              <option value="" disabled>
                Elige cómo repartir
              </option>
              {Object.entries(comboModes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <p>
            La base del combo se reparte entre sus unidades de componentes. Cada parte conserva el
            perfil tributario del componente. Los adicionales elegidos se suman a su parte.
          </p>
          <p className="muted small">
            El reparto proporcional usa precios base de referencia de la sucursal/canal; requiere
            alguna base positiva cuando el combo tiene precio positivo. Los restos se asignan con
            cuatro decimales y orden estable. Revisa las partes al tomar el pedido.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">La ficha cambió. Cierra y abre la configuración actualizada.</p>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={close}>
            Cerrar
          </button>
          <Submit pending={operation.isPending} disabled={conflict && !operation.uncertain}>
            {operation.uncertain ? 'Reintentar reparto' : 'Guardar reparto'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}

export function ComboPanel({ product }: { product: Product }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<ComboComponent | 'new' | null>(null)
  const [settings, setSettings] = useState(false)
  const [alternative, setAlternative] = useState<ComboGroup | null>(null)
  const can = useCan()
  const client = useQueryClient()
  const params = new URLSearchParams({ page: String(page), per_page: '10' })
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['combo-components', product.id, params.toString()],
    queryFn: ({ signal }) =>
      api<
        CatalogPage<ComboComponent> & {
          product_revision: number
          allocation_mode: ComboMode | null
          combo_context: { ready: boolean; reason: string | null; expanded_units: number }
          groups: ComboGroup[]
        }
      >(`products/${product.id}/combo-components?${params}`, { signal }),
  })
  const current = query.data?.product_revision === product.revision
  return (
    <section className="panel variants-panel combo-admin">
      <div className="panel-heading">
        <h2>Composición del combo</h2>
        {can('catalog.manage') && (
          <div className="combo-actions">
            <button
              className="button secondary"
              disabled={!current}
              onClick={() => setSettings(true)}
            >
              Configurar reparto
            </button>
            <button
              className="button primary"
              disabled={!current}
              onClick={() => {
                setAlternative(null)
                setEditing('new')
              }}
            >
              Nuevo componente
            </button>
          </div>
        )}
      </div>
      <p className="muted small">
        El precio base se configura en los datos del producto o sus reglas por sucursal/canal. El
        combo exige sus componentes fijos y los mínimos de cada grupo. Las alternativas y
        preparaciones se eligen al tomarlo.
      </p>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <p>
            {query.data.allocation_mode
              ? comboModes[query.data.allocation_mode]
              : 'Reparto pendiente'}{' '}
            · {query.data.combo_context.expanded_units} unidades en la selección mínima disponible
          </p>
          {query.data.combo_context.reason && (
            <p className="notice">{query.data.combo_context.reason}</p>
          )}
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
            <span>Estado de componentes</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Archivados</option>
            </select>
          </label>
          {query.data.data.length ? (
            <div className="table-scroll">
              <table className="variant-table">
                <thead>
                  <tr>
                    <th>Producto y presentación</th>
                    <th>Unidades</th>
                    <th>Estado</th>
                    {can('catalog.manage') && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((component) => (
                    <tr key={component.id}>
                      <td>
                        <strong>{component.product?.name}</strong>
                        <small>{component.variant?.name ?? 'Presentación única'}</small>
                        <small>
                          {component.combo_group_id
                            ? (query.data.groups.find(
                                (group) => group.id === component.combo_group_id,
                              )?.name ?? `Grupo #${component.combo_group_id}`)
                            : 'Fijo obligatorio'}
                        </small>
                      </td>
                      <td>{component.units}</td>
                      <td>{component.is_active ? 'Activo' : 'Archivado'}</td>
                      {can('catalog.manage') && (
                        <td>
                          <button
                            className="text-button"
                            disabled={!current}
                            aria-label={`Editar componente ${component.product?.name}`}
                            onClick={() => setEditing(component)}
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
            <p className="empty-inline muted">Agrega productos individuales a este combo.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      <ComboGroupsPanel
        product={product}
        onAlternative={(group) => {
          setAlternative(group)
          setEditing('new')
        }}
      />
      {editing && (
        <ComboComponentEditor
          product={product}
          component={editing === 'new' ? null : editing}
          group={editing === 'new' ? alternative : null}
          onClose={() => setEditing(null)}
        />
      )}
      {settings && <ComboSettingsEditor product={product} onClose={() => setSettings(false)} />}
    </section>
  )
}
