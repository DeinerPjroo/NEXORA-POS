import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, PackageSearch, RefreshCw } from 'lucide-react'
import { ErrorNotice } from '../../components/ui'
import type { CatalogPage } from './types'

export function useDebounce(value: string) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 250)
    return () => clearTimeout(timer)
  }, [value])
  return debounced
}

export function Pagination({
  meta,
  onPage,
  pending,
}: {
  meta: CatalogPage<unknown>['meta']
  onPage: (page: number) => void
  pending: boolean
}) {
  return (
    <div className="catalog-pagination">
      <span>{meta.total ? `${meta.from}–${meta.to} de ${meta.total}` : 'Sin registros'}</span>
      <div>
        <button
          type="button"
          className="icon-button"
          aria-label="Página anterior"
          disabled={meta.current_page <= 1 || pending}
          onClick={() => onPage(meta.current_page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          Página {meta.current_page} de {meta.last_page}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Página siguiente"
          disabled={meta.current_page >= meta.last_page || pending}
          onClick={() => onPage(meta.current_page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

export function CatalogError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="catalog-error">
      <ErrorNotice error={error} />
      <button className="button secondary" onClick={onRetry}>
        <RefreshCw size={15} />
        Volver a consultar
      </button>
    </div>
  )
}

export function CatalogEmpty({
  filtered,
  children,
}: {
  filtered: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="empty-state catalog-empty">
      <span className="catalog-empty-icon">
        <PackageSearch size={30} />
      </span>
      <h2>{filtered ? 'No encontramos coincidencias' : 'Tu menú empieza con una idea.'}</h2>
      <p>
        {filtered
          ? 'Prueba otra búsqueda o ajusta los filtros.'
          : 'Crea tus categorías y productos para darle forma a tu catálogo.'}
      </p>
      {children}
    </div>
  )
}
