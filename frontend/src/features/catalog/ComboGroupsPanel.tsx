import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, Submit } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { OperationNotice } from '../operations/OperationNotice'
import { CatalogError, Pagination } from './catalog-ui'
import { useComboWrite } from './ComboComponentEditor'
import type { ComboGroup } from './combo-types'
import type { CatalogPage, Product } from './types'

function ComboGroupEditor({
  product,
  group,
  onClose,
}: {
  product: Product
  group: ComboGroup | null
  onClose: () => void
}) {
  const { session } = useSession()
  const [snapshot] = useState({ revision: product.revision, currency: session!.company.currency })
  const operation = useComboWrite(
    `products/${product.id}/combo-groups${group ? `/${group.id}` : ''}`,
    !!group,
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
    const data = new FormData(event.currentTarget)
    operation.send({
      product_revision: snapshot.revision,
      currency: snapshot.currency,
      ...(group ? { revision: group.revision } : {}),
      name: data.get('name'),
      min_select: Number(data.get('min_select')),
      max_select: Number(data.get('max_select')),
      position: Number(data.get('position')),
      is_active: data.get('is_active') === 'on',
    })
  }
  return (
    <Modal title={`${group ? 'Editar grupo' : 'Nuevo grupo'} de alternativas`} onClose={close}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Nombre del grupo">
            <input name="name" required maxLength={80} defaultValue={group?.name ?? ''} />
          </Field>
          <Field label="Mínimo de alternativas">
            <input
              name="min_select"
              type="number"
              required
              min={0}
              max={20}
              defaultValue={group?.min_select ?? 0}
            />
          </Field>
          <Field label="Máximo de alternativas">
            <input
              name="max_select"
              type="number"
              required
              min={1}
              max={20}
              defaultValue={group?.max_select ?? 1}
            />
          </Field>
          <Field label="Orden del grupo">
            <input
              name="position"
              type="number"
              required
              min={0}
              max={999}
              defaultValue={group?.position ?? 0}
            />
          </Field>
          <label className="checkbox-line">
            <input type="checkbox" name="is_active" defaultChecked={group?.is_active ?? true} />
            <span>Grupo activo</span>
          </label>
          <p className="muted small">
            Crea el grupo con mínimo 0 o archivado, agrega alternativas y después exige un mínimo.
            Hasta 8 grupos activos y 20 alternativas activas por grupo. El mínimo cuenta
            alternativas; las unidades elegidas no pueden superar 20 en el combo. Archivar el grupo
            conserva sus alternativas.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">La ficha cambió. Cierra y vuelve a abrir el grupo actualizado.</p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cerrar
          </button>
          <Submit pending={operation.isPending} disabled={conflict && !operation.uncertain}>
            {operation.uncertain ? 'Reintentar grupo' : 'Guardar grupo'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}

export function ComboGroupsPanel({
  product,
  onAlternative,
}: {
  product: Product
  onAlternative: (group: ComboGroup) => void
}) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<ComboGroup | 'new' | null>(null)
  const can = useCan()
  const params = new URLSearchParams({ page: String(page), per_page: '10' })
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['combo-groups', product.id, params.toString()],
    queryFn: ({ signal }) =>
      api<CatalogPage<ComboGroup> & { product_revision: number }>(
        `products/${product.id}/combo-groups?${params}`,
        { signal },
      ),
  })
  const current = query.data?.product_revision === product.revision
  return (
    <section className="form-stack">
      <div className="panel-heading">
        <h3>Grupos de alternativas</h3>
        {can('catalog.manage') && (
          <button
            className="button secondary"
            disabled={!current}
            onClick={() => setEditing('new')}
          >
            Nuevo grupo de alternativas
          </button>
        )}
      </div>
      <Field label="Estado de grupos">
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
      </Field>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          {query.data.data.map((group) => (
            <div className="cart-line combo-composition" key={group.id}>
              <strong>{group.name}</strong>
              <span>
                Elegir {group.min_select}–{group.max_select} alternativas ·{' '}
                {group.is_active ? 'Activo' : 'Archivado'}
              </span>
              {can('catalog.manage') && (
                <div className="combo-actions">
                  <button
                    className="text-button"
                    disabled={!current}
                    onClick={() => setEditing(group)}
                    aria-label={`Editar grupo ${group.name}`}
                  >
                    Editar grupo
                  </button>
                  <button
                    className="text-button"
                    disabled={!current}
                    onClick={() => onAlternative(group)}
                    aria-label={`Agregar alternativa a ${group.name}`}
                  >
                    Agregar alternativa
                  </button>
                </div>
              )}
            </div>
          ))}
          {!query.data.data.length && (
            <p className="muted">Los grupos permiten elegir entre productos del combo.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <ComboGroupEditor
          product={product}
          group={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
