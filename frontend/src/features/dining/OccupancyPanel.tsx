import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutGrid, RefreshCw, Search, UsersRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import type { DiningRoom } from './types'
import type { DiningSelection, TableChoice } from './session-types'
import { SessionEditor } from './SessionEditor'
import { ReleaseTable } from './ReleaseTable'
import './digital-tables.css'
import { useTablesLayout } from '../studio/useTablesLayout'
import { tablesStyle, type TablesLayout } from '../studio/tables-layout'
import '../studio/tables-layout.css'

type Occupancy = {
  table: TableChoice
  session: {
    id: number
    revision: number
    guest_count: number
    waiter_name: string | null
    opened_at: string
    can_release: boolean
    paid_occupied: boolean
  } | null
}
export function OccupancyPanel({
  room,
  onSelect,
  digital = false,
  studioPreview,
}: {
  room: DiningRoom
  onSelect?: (selection: DiningSelection) => void
  digital?: boolean
  studioPreview?: TablesLayout
}) {
  const can = useCan()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all')
  const [search, setSearch] = useState('')
  const [opening, setOpening] = useState<TableChoice | null>(null)
  const [releasing, setReleasing] = useState<{
    session: NonNullable<Occupancy['session']>
    label: string
  } | null>(null)
  const layout = useTablesLayout(digital, !!opening || !!releasing, studioPreview)
  const query = useQuery({
    queryKey: ['dining-occupancy', room.id],
    queryFn: ({ signal }) =>
      api<{ data: Occupancy[] }>('dining-rooms/' + room.id + '/occupancy', { signal }),
    refetchInterval: studioPreview ? false : 15000,
  })
  const entries = query.data?.data ?? []
  const occupied = entries.filter((entry) => entry.session).length
  const visible = entries.filter(
    (entry) =>
      (filter === 'all' || Boolean(entry.session) === (filter === 'occupied')) &&
      entry.table.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  return (
    <section
      className={'panel dining-layout' + (digital ? ' digital-floor' : '')}
      data-studio-tables={!!layout}
      data-studio-symbol={layout?.options.symbol}
      data-studio-capacity={layout?.options.capacity}
      style={layout ? tablesStyle(layout) : undefined}
    >
      {digital && (
        <>
          <div className="digital-floor-heading">
            <div>
              <span className="digital-floor-eyebrow">MAPA DE MESAS</span>
              <strong>{room.name}</strong>
            </div>
            <button
              type="button"
              className="digital-refresh"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              aria-label="Actualizar ocupación"
            >
              <RefreshCw size={15} className={query.isFetching ? 'spin' : undefined} />
              {query.isFetching ? 'Actualizando' : query.error ? 'Reintentar' : 'Actualizar'}
            </button>
          </div>
          <div className="digital-floor-filters" role="group" aria-label="Filtrar ocupación">
            {(['all', 'available', 'occupied'] as const).map((value, index) => (
              <button
                type="button"
                key={value}
                data-state={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                <span>{['Todas', 'Libres', 'Ocupadas'][index]}</span>
                <strong>
                  {query.data ? [entries.length, entries.length - occupied, occupied][index] : '—'}
                </strong>
              </button>
            ))}
          </div>
          <label className="digital-table-search">
            <Search size={15} />
            <input
              aria-label="Buscar mesa"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar mesa por nombre o número…"
            />
          </label>
        </>
      )}
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
          {(digital ? visible : entries).map(({ table, session }) =>
            digital ? (
              <DigitalTable
                key={table.id}
                entry={{ table, session }}
                selectable={Boolean(onSelect)}
                onRelease={
                  session?.can_release && can('dining.operate')
                    ? () => setReleasing({ session, label: table.name })
                    : undefined
                }
                disabled={
                  !session && (!can('dining.operate') || !room.is_active || !room.branch.is_active)
                }
                onClick={() => {
                  if (!session) {
                    setOpening(structuredClone(table))
                    return
                  }
                  if (onSelect)
                    onSelect({
                      id: session.id,
                      revision: session.revision,
                      branch_id: room.branch_id,
                      label: table.name + ' · Atención #' + session.id,
                    })
                  else navigate('/salones/atenciones/' + session.id)
                }}
              />
            ) : (
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
            ),
          )}
        </div>
      )}
      {digital && !query.isPending && !query.error && !visible.length && (
        <p className="digital-floor-empty">
          <LayoutGrid size={22} />
          No hay mesas para este filtro.
        </p>
      )}
      <Link className="text-button" to="/salones/atenciones">
        Historial de atenciones
      </Link>
      {releasing && (
        <ReleaseTable
          key={releasing.session.id}
          session={releasing.session}
          label={releasing.label}
          onClose={() => setReleasing(null)}
        />
      )}
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

function DigitalTable({
  entry: { table, session },
  selectable,
  onRelease,
  disabled,
  onClick,
}: {
  entry: Occupancy
  selectable: boolean
  onRelease?: () => void
  disabled: boolean
  onClick: () => void
}) {
  const number = table.name.match(/\d+/)?.[0]?.padStart(2, '0')
  return (
    <article
      className="dining-occupancy-card digital-table"
      data-state={session?.paid_occupied ? 'paid' : session ? 'occupied' : 'available'}
      data-releasable={!!onRelease}
    >
      <button
        type="button"
        className="digital-table-hit"
        disabled={disabled}
        onClick={onClick}
        aria-label={
          session
            ? selectable
              ? 'Seleccionar ' + table.name
              : 'Ver atención #' + session.id
            : 'Ocupar ' + table.name
        }
      >
        <span className="digital-table-top">
          <strong>{table.name}</strong>
          <span className="digital-state-dot" />
        </span>
        <span className="digital-table-symbol" aria-hidden="true">
          <i />
          <b>{number ?? <LayoutGrid size={22} />}</b>
          <i />
        </span>
        <span className="digital-table-state">
          {session?.paid_occupied ? 'Pagada · todavía ocupada' : session ? 'Ocupada' : 'Libre'}
        </span>
        <span className="digital-table-bottom">
          <span>
            <UsersRound size={12} />
            {session ? session.guest_count + ' personas' : table.capacity + ' plazas'}
          </span>
          <span>{session ? '#' + session.id : 'Abrir →'}</span>
        </span>
      </button>
      {onRelease && (
        <button
          type="button"
          className="digital-table-release"
          aria-label={`Liberar ${table.name}`}
          onClick={onRelease}
        >
          Liberar mesa
        </button>
      )}
    </article>
  )
}
