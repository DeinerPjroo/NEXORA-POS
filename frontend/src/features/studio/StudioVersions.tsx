import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal } from '../../components/ui'
import { useSession } from '../auth/SessionProvider'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { SavedPosLayout } from './PosStudioPage'
import { scopeQuery, type LayoutScope } from './layout-scope'

export type LayoutVersion = {
  id: number
  revision: number
  kind: string
  configuration: unknown
  author: string | null
  source_version_id: number | null
  reason: string | null
  created_at: string
  archive: { reason: string; created_at: string } | null
  current_draft: boolean
  current_published: boolean
}
export type VersionAction = {
  version: LayoutVersion
  action: 'restore' | 'archive'
  revision: number
}
export function StudioVersions({
  scope,
  surface = 'pos',
  revision,
  locked,
  editable,
  onPreview,
  onAction,
}: {
  scope: LayoutScope
  surface?: 'pos' | 'tables'
  revision: number
  locked: boolean
  editable: boolean
  onPreview: (version: LayoutVersion) => void
  onAction: (action: VersionAction) => void
}) {
  const [page, setPage] = useState(1)
  const [archived, setArchived] = useState(false)
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['studio-pos-versions', surface, scope, revision, page, archived],
    queryFn: ({ signal }) =>
      api<CatalogPage<LayoutVersion>>(
        `studio/${surface}/versions?${scopeQuery(scope)}&page=${page}&archived=${archived ? 1 : 0}`,
        { signal },
      ),
    enabled: !locked,
    refetchOnWindowFocus: false,
  })
  const time = (value: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: session!.company.timezone,
    }).format(new Date(value))
  return (
    <section className="panel studio-version-history" aria-label="Historial de diseños">
      <header>
        <h2>Historial de versiones</h2>
        <label>
          <input
            type="checkbox"
            checked={archived}
            disabled={locked}
            onChange={(event) => {
              setArchived(event.target.checked)
              setPage(1)
            }}
          />{' '}
          Incluir archivadas
        </label>
      </header>
      <ErrorNotice error={query.error} />
      {query.error && <button onClick={() => void query.refetch()}>Reintentar historial</button>}
      {query.isPending ? (
        <Loading />
      ) : (
        <div className="studio-history-scroll">
          <table>
            <thead>
              <tr>
                <th>Versión</th>
                <th>Autor y fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((version) => (
                <tr key={version.id}>
                  <td>
                    <strong>Versión {version.revision}</strong>
                    <small>
                      {version.kind === 'published'
                        ? 'Publicación'
                        : version.kind === 'restored'
                          ? 'Restauración'
                          : 'Borrador'}
                      {version.source_version_id ? ' desde historial' : ''}
                    </small>
                    {version.reason && <small>{version.reason}</small>}
                  </td>
                  <td>
                    {version.author ?? 'Autor no registrado'}
                    <small>{time(version.created_at)}</small>
                  </td>
                  <td>
                    {version.current_published
                      ? 'Publicada actualmente'
                      : version.current_draft
                        ? 'Borrador actual'
                        : version.archive
                          ? 'Archivada'
                          : 'Histórica'}
                    {version.archive && <small>{version.archive.reason}</small>}
                  </td>
                  <td>
                    <button type="button" disabled={locked} onClick={() => onPreview(version)}>
                      Previsualizar versión {version.revision}
                    </button>
                    <button
                      type="button"
                      disabled={locked || !editable}
                      onClick={() => onAction({ version, action: 'restore', revision })}
                    >
                      Restaurar versión {version.revision}
                    </button>
                    <button
                      type="button"
                      disabled={
                        locked ||
                        !editable ||
                        !!version.archive ||
                        version.current_draft ||
                        version.current_published
                      }
                      onClick={() => onAction({ version, action: 'archive', revision })}
                    >
                      Archivar versión {version.revision}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query.data?.data.length && <p>No hay versiones en este filtro.</p>}
        </div>
      )}
      {query.data && (
        <Pagination meta={query.data.meta} pending={query.isFetching || locked} onPage={setPage} />
      )}
    </section>
  )
}
export function StudioVersionAction({
  scope,
  surface = 'pos',
  value,
  onClose,
  onSaved,
  onStale,
}: {
  scope: LayoutScope
  surface?: 'pos' | 'tables'
  value: VersionAction
  onClose: () => void
  onSaved: (layout: SavedPosLayout) => void
  onStale: () => void
}) {
  const operation = useOperation<SavedPosLayout>(`studio/${surface}/${value.action}`, (result) => {
    onSaved(result)
    onClose()
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    operation.send({
      ...scope,
      revision: value.revision,
      version_id: value.version.id,
      reason: new FormData(event.currentTarget).get('reason'),
    })
  }
  return (
    <Modal
      title={
        value.action === 'restore' ? 'Restaurar diseño como borrador' : 'Archivar versión de diseño'
      }
      onClose={onClose}
      locked={operation.locked}
    >
      <form className="form-stack" onSubmit={submit}>
        <p>
          Versión {value.version.revision}.{' '}
          {value.action === 'restore'
            ? 'Se guardará un nuevo borrador. La terminal no cambia hasta publicarlo.'
            : 'Se conserva su configuración e historial; podrás consultarla con el filtro de archivadas.'}
        </p>
        <ErrorNotice error={operation.error} />
        {operation.error instanceof ApiError && operation.error.status === 409 && (
          <button type="button" disabled={operation.locked} onClick={onStale}>
            Cerrar y recargar diseño
          </button>
        )}
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked}>
          <Field label="Motivo">
            <textarea name="reason" minLength={3} maxLength={300} required rows={3} />
          </Field>
        </fieldset>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={operation.locked}
            onClick={onClose}
          >
            Volver
          </button>
          <button type="submit" className="button primary" disabled={operation.isPending}>
            {operation.uncertain
              ? 'Reintentar mismo cambio'
              : value.action === 'restore'
                ? 'Confirmar restauración'
                : 'Confirmar archivo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
