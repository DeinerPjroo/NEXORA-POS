import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import type { DiningRoom } from './types'
import type { DiningSelection, TableChoice } from './session-types'
import { SessionEditor } from './SessionEditor'

type Occupancy = {
  table: TableChoice
  session: {
    id: number
    revision: number
    guest_count: number
    waiter_name: string | null
    opened_at: string
  } | null
}
export function OccupancyPanel({
  room,
  onSelect,
}: {
  room: DiningRoom
  onSelect?: (selection: DiningSelection) => void
}) {
  const can = useCan()
  const [opening, setOpening] = useState<TableChoice | null>(null)
  const query = useQuery({
    queryKey: ['dining-occupancy', room.id],
    queryFn: ({ signal }) =>
      api<{ data: Occupancy[] }>('dining-rooms/' + room.id + '/occupancy', { signal }),
    refetchInterval: 15000,
  })
  return (
    <section className="panel dining-layout">
      <div className="dining-layout-heading">
        <div>
          <h2>Atención en mesas</h2>
          <p className="muted">Ocupación actual · Una atención puede agrupar varias mesas.</p>
        </div>
        <button className="button secondary" onClick={() => void query.refetch()}>
          Actualizar ocupación
        </button>
      </div>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div className="dining-occupancy-grid">
          {query.data?.data.map(({ table, session }) => (
            <article
              className="dining-occupancy-card"
              key={table.id}
              data-state={session ? 'occupied' : 'available'}
            >
              <div>
                <strong>{table.name}</strong>
                <span className={'pill ' + (session ? 'neutral' : 'green')}>
                  {session ? 'Ocupada' : 'Libre'}
                </span>
              </div>
              <p>
                {table.capacity} plazas{session && ' · Atención #' + session.id}
              </p>
              {session ? (
                <>
                  <p className="muted">
                    {session.guest_count} personas en la atención ·{' '}
                    {session.waiter_name ?? 'Sin mesero asignado'}
                  </p>
                  <Link className="button secondary" to={'/salones/atenciones/' + session.id}>
                    Ver atención #{session.id}
                  </Link>
                  {onSelect && (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() =>
                        onSelect({
                          id: session.id,
                          revision: session.revision,
                          branch_id: room.branch_id,
                          label: table.name + ' · Atención #' + session.id,
                        })
                      }
                    >
                      Seleccionar {table.name}
                    </button>
                  )}
                </>
              ) : (
                can('dining.operate') &&
                room.is_active &&
                room.branch.is_active && (
                  <button
                    className="button primary"
                    onClick={() => setOpening(structuredClone(table))}
                    aria-label={'Ocupar ' + table.name}
                  >
                    Ocupar mesa
                  </button>
                )
              )}
            </article>
          ))}
        </div>
      )}
      <Link className="text-button" to="/salones/atenciones">
        Historial de atenciones
      </Link>
      {opening && (
        <SessionEditor
          branchId={room.branch_id}
          initialTable={opening}
          onClose={() => setOpening(null)}
          onSaved={
            onSelect
              ? (session) =>
                  onSelect({
                    id: session.id,
                    revision: session.revision,
                    branch_id: session.branch_id,
                    label:
                      session.tables
                        .filter((t) => !t.released_at)
                        .map((t) => t.table_name)
                        .join(', ') +
                      ' · Atención #' +
                      session.id,
                  })
              : undefined
          }
        />
      )}
    </section>
  )
}
