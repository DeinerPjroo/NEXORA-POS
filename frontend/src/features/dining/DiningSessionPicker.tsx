import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field } from '../../components/ui'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { DiningSelection, DiningSession } from './session-types'
export function DiningSessionPicker({
  branchId,
  selected,
  disabled,
  onChange,
}: {
  branchId: number
  selected: DiningSelection | null
  disabled: boolean
  onChange: (value: DiningSelection | null) => void
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['dining-sessions', 'picker', branchId, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<DiningSession>>(
        'dining-sessions?status=open&per_page=50&branch_id=' + branchId + '&page=' + page,
        { signal },
      ),
    refetchInterval: 15000,
  })
  const match = query.data?.data.find((s) => s.id === selected?.id)
  return (
    <>
      <ErrorNotice error={query.error} />
      <Field label="Atención de mesas">
        <select
          value={selected?.id ?? ''}
          disabled={disabled || query.isPending}
          onChange={(e) => {
            const s = query.data?.data.find((v) => v.id === Number(e.target.value))
            onChange(
              s
                ? {
                    id: s.id,
                    revision: s.revision,
                    branch_id: s.branch_id,
                    label:
                      'Atención #' +
                      s.id +
                      ' · ' +
                      s.tables
                        .filter((t) => !t.released_at)
                        .map((t) => t.table_name)
                        .join(', '),
                  }
                : null,
            )
          }}
        >
          <option value="">Sin atención de mesa</option>
          {selected && !match && (
            <option value={selected.id}>{selected.label} · Revisa su estado</option>
          )}
          {query.data?.data.map((s) => (
            <option key={s.id} value={s.id}>
              Atención #{s.id} ·{' '}
              {s.tables
                .filter((t) => !t.released_at)
                .map((t) => t.table_name)
                .join(', ')}
            </option>
          ))}
        </select>
      </Field>
      {selected && match && match.revision !== selected.revision && (
        <p className="notice">
          La atención cambió. Selecciona otra opción y vuelve a elegirla para revisar su estado
          antes de enviar.
        </p>
      )}
      {query.data && query.data.meta.last_page > 1 && (
        <Pagination
          meta={query.data.meta}
          pending={disabled || query.isFetching}
          onPage={setPage}
        />
      )}
    </>
  )
}
