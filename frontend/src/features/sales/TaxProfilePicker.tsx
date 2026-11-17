import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Loading, Modal } from '../../components/ui'
import { CatalogError, Pagination, useDebounce } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { taxSummary } from './tax-types'
import type { TaxChoice, TaxProfile } from './tax-types'

export function TaxProfilePicker({
  value,
  onChange,
  allowNone = true,
}: {
  value: TaxChoice | null
  onChange: (profile: TaxChoice | null) => void
  allowNone?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="button secondary"
        aria-label={`Perfil de impuestos: ${value?.name ?? 'Sin perfil'}`}
        onClick={() => setOpen(true)}
      >
        {value?.name ?? (allowNone ? 'Sin perfil de impuestos' : 'Elegir perfil de impuestos')}
      </button>
      {value && <small className="muted">{taxSummary(value)}</small>}
      {open && (
        <Choices
          allowNone={allowNone}
          onClose={() => setOpen(false)}
          onPick={(profile) => {
            onChange(profile)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function Choices({
  onPick,
  onClose,
  allowNone,
}: {
  onPick: (profile: TaxChoice | null) => void
  onClose: () => void
  allowNone: boolean
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const text = useDebounce(search)
  const params = new URLSearchParams({
    status: 'active',
    search: text,
    page: String(page),
    per_page: '10',
  })
  const query = useQuery({
    queryKey: ['tax-profiles', 'picker', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<TaxProfile>>(`tax-profiles?${params}`, { signal }),
  })
  return (
    <Modal title="Elige un perfil de impuestos" onClose={onClose}>
      <input
        aria-label="Buscar perfil de impuestos"
        placeholder="Buscar perfil…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(1)
        }}
        autoFocus
      />
      {allowNone && (
        <button type="button" className="category-choice" onClick={() => onPick(null)}>
          Sin perfil · No agrega impuestos por producto
        </button>
      )}
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="category-choice-list">
            {query.data.data.map((profile) => (
              <button
                type="button"
                className="category-choice"
                key={profile.id}
                onClick={() => onPick(profile)}
              >
                <span>
                  <strong>{profile.name}</strong>
                  <small>{taxSummary(profile)}</small>
                </span>
              </button>
            ))}
          </div>
          {!query.data.data.length && (
            <p className="notice">No hay perfiles activos con esta búsqueda.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </>
      )}
    </Modal>
  )
}
