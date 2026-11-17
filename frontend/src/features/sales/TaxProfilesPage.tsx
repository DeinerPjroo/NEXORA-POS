import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Loading, PageTitle } from '../../components/ui'
import { CatalogError, Pagination, useDebounce } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { TaxProfileEditor } from './TaxProfileEditor'
import { taxSummary } from './tax-types'
import type { TaxProfile } from './tax-types'

export function TaxProfilesPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [editing, setEditing] = useState<TaxProfile | 'new' | null>(null)
  const text = useDebounce(search)
  const params = new URLSearchParams({ status, search: text, page: String(page), per_page: '12' })
  const query = useQuery({
    queryKey: ['tax-profiles', params.toString()],
    queryFn: ({ signal }) => api<CatalogPage<TaxProfile>>(`tax-profiles?${params}`, { signal }),
  })
  return (
    <>
      <Link className="text-button product-back" to="/ventas">
        Volver a ventas
      </Link>
      <PageTitle
        eyebrow="TASAS EXPLÍCITAS, HISTORIA CONSERVADA"
        title="Perfiles de impuestos"
        description="Asigna perfiles a productos y activa su cálculo en Configurar ventas. Cada pedido conserva sus tasas; editar o archivar no cambia pedidos anteriores."
        action={
          <button className="button primary" onClick={() => setEditing('new')}>
            Nuevo perfil
          </button>
        }
      />
      <div className="operation-toolbar">
        <input
          aria-label="Buscar perfiles de impuestos"
          placeholder="Buscar perfil…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Estado de perfiles de impuestos"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="active">Activos</option>
          <option value="inactive">Archivados</option>
          <option value="all">Todos</option>
        </select>
        <Link className="text-button" to="/ventas/configuracion">
          Configurar cálculo de ventas
        </Link>
      </div>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <section className="panel sales-list-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Perfil</th>
                  <th>Impuestos</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.name}</strong>
                    </td>
                    <td>{taxSummary(profile)}</td>
                    <td>{profile.is_active ? 'Activo' : 'Archivado'}</td>
                    <td>
                      <button
                        className="text-button"
                        aria-label={`Editar perfil ${profile.name}`}
                        onClick={() => setEditing(profile)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && (
            <p className="empty-inline muted">No hay perfiles con esta búsqueda.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </section>
      )}
      {editing && (
        <TaxProfileEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
