import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { DiningRoom } from './types'
import { OccupancyPanel } from './OccupancyPanel'
import './dining.css'

export function TerminalTablesPage() {
  const can = useCan()
  const [selected, setSelected] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['terminal-rooms', page],
    queryFn: ({ signal }) =>
      api<CatalogPage<DiningRoom>>(`dining-rooms?status=active&per_page=30&page=${page}`, {
        signal,
      }),
  })
  const room = query.data?.data.find((item) => item.id === selected) ?? query.data?.data[0]
  return (
    <div className="terminal-tables">
      <div className="terminal-section-heading">
        <h1>Mesas y salones</h1>
        <span>Selecciona una mesa para abrir o consultar su atención</span>
      </div>
      <ErrorNotice error={query.error} />
      <nav className="terminal-room-tabs" aria-label="Salones operativos">
        {query.data?.data.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={room?.id === item.id}
            onClick={() => setSelected(item.id)}
          >
            {item.name} · {item.branch.name}
          </button>
        ))}
      </nav>
      {query.isPending ? (
        <Loading />
      ) : room ? (
        <OccupancyPanel key={room.id} room={room} />
      ) : (
        <p className="notice">
          No hay salones activos. Configúralos en Nexora Admin para operar sus mesas.
        </p>
      )}
      {query.data && query.data.meta.last_page > 1 && (
        <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
      )}
      <div className="terminal-quick-actions">
        {can('cash.view') && <Link to="/caja">Caja rápida</Link>}
        {can('orders.manage') && can('catalog.view') && (
          <Link to="/pedidos/nuevo">Para llevar / nuevo pedido</Link>
        )}
        <button disabled title="Operación de domicilios pendiente de integración">
          Domicilios · Pendiente
        </button>
        {can('dining.reserve') && <Link to="/salones/reservas">Reservaciones</Link>}
      </div>
    </div>
  )
}
