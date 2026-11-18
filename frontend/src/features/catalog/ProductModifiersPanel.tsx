import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Pencil, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from './catalog-ui'
import type { CatalogPage, Product } from './types'
import type { ModifierGroup, ModifierOption } from './modifier-types'
import { ModifierGroupEditor } from './ModifierGroupEditor'
import { ModifierOptionEditor } from './ModifierOptionEditor'

export function ProductModifiersPanel({ product }: { product: Product }) {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ModifierGroup | 'new' | null>(null)
  const [option, setOption] = useState<{
    group: ModifierGroup
    option: ModifierOption | null
  } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const can = useCan()
  const { session } = useSession()
  const currency = session!.company.currency
  const query = useQuery({
    queryKey: ['modifier-groups', product.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<ModifierGroup>>(`products/${product.id}/modifier-groups?page=${page}`, {
        signal,
      }),
  })
  function close() {
    setEditing(null)
    setOption(null)
    void query.refetch()
  }
  return (
    <section className="panel product-modifiers-panel">
      <div className="panel-heading">
        <div>
          <h2>Adicionales y exclusiones</h2>
          <p className="muted small">
            Configura opciones para todas las presentaciones de este producto.
          </p>
        </div>
        {can('catalog.manage') && (
          <button type="button" className="button secondary" onClick={() => setEditing('new')}>
            <Plus size={16} />
            Nuevo grupo
          </button>
        )}
      </div>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="modifier-group-list">
            {query.data.data.map((group) => (
              <article className="modifier-group-card" key={group.id}>
                <div className="modifier-group-heading">
                  <div>
                    <h3>{group.name}</h3>
                    <p className="muted small">
                      {group.kind === 'addon' ? 'Adicionales' : 'Exclusiones sin recargo'} · Mínimo{' '}
                      {group.min_select}, máximo {group.max_select}
                    </p>
                  </div>
                  <span className={`pill ${group.is_active ? 'green' : 'neutral'}`}>
                    {group.is_active ? 'Activo' : 'Archivado'}
                  </span>
                </div>
                <p className="muted small">
                  {group.active_options_count ?? 0} opciones activas de {group.options_count ?? 0}{' '}
                  conservadas.
                </p>
                <div className="modifier-group-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Ver opciones de ${group.name}`}
                    onClick={() => setExpanded(expanded === group.id ? null : group.id)}
                  >
                    <ChevronDown size={15} />
                    {expanded === group.id ? 'Ocultar opciones' : 'Ver opciones'}
                  </button>
                  {can('catalog.manage') && (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Editar grupo ${group.name}`}
                        onClick={() => setEditing(group)}
                      >
                        <Pencil size={15} />
                        Editar grupo
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Nueva opción en ${group.name}`}
                        onClick={() => setOption({ group, option: null })}
                      >
                        <Plus size={15} />
                        Nueva opción
                      </button>
                    </>
                  )}
                </div>
                {expanded === group.id && (
                  <ModifierOptionsList
                    product={product}
                    group={group}
                    currency={currency}
                    onEdit={(value) => setOption({ group, option: value })}
                  />
                )}
              </article>
            ))}
          </div>
          {!query.data.data.length && (
            <p className="empty-inline muted">
              Aún no hay grupos. Puedes ofrecer adicionales o permitir exclusiones sin recargo.
            </p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
      {editing && (
        <ModifierGroupEditor
          product={product}
          group={editing === 'new' ? null : editing}
          currency={currency}
          onClose={close}
        />
      )}
      {option && (
        <ModifierOptionEditor
          product={product}
          group={option.group}
          option={option.option}
          currency={currency}
          onClose={close}
        />
      )}
    </section>
  )
}

function ModifierOptionsList({
  product,
  group,
  currency,
  onEdit,
}: {
  product: Product
  group: ModifierGroup
  currency: string
  onEdit: (option: ModifierOption) => void
}) {
  const [page, setPage] = useState(1)
  const can = useCan()
  const query = useQuery({
    queryKey: ['modifier-options', product.id, group.id, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<ModifierOption>>(
        `products/${product.id}/modifier-groups/${group.id}/options?page=${page}`,
        { signal },
      ),
  })
  if (query.error) return <CatalogError error={query.error} onRetry={() => void query.refetch()} />
  if (query.isPending) return <Loading />
  return (
    <div className="modifier-options-list">
      {query.data.data.map((option) => (
        <div className="modifier-option-row" key={option.id}>
          <div>
            <strong>{option.name}</strong>
            <small className="muted">{option.is_active ? 'Activa' : 'Archivada'}</small>
          </div>
          <b>{formatMoney(option.extra_price, currency)}</b>
          {can('catalog.manage') && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Editar opción ${option.name}`}
              onClick={() => onEdit(option)}
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
      ))}
      {!query.data.data.length && <p>No hay opciones en esta página.</p>}
      <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
    </div>
  )
}
