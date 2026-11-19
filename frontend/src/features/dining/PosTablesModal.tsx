import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, Modal } from '../../components/ui'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { DiningRoom } from './types'
import type { DiningSelection } from './session-types'
import { OccupancyPanel } from './OccupancyPanel'
import './dining.css'

export function PosTablesModal({
  branchId,
  onSelect,
  onClose,
}: {
  branchId: number
  onSelect: (selection: DiningSelection) => void
  onClose: () => void
}) {
  const [roomId, setRoomId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const rooms = useQuery({
    queryKey: ['pos-table-rooms', branchId, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<DiningRoom>>(
        `dining-rooms?branch_id=${branchId}&status=active&per_page=30&page=${page}`,
        { signal },
      ),
  })
  const room = rooms.data?.data.find((item) => item.id === roomId) ?? rooms.data?.data[0]
  return (
    <Modal title="Mesas del terminal" onClose={onClose} className="modal pos-tables-drawer">
      <div className="pos-tables-picker">
        <ErrorNotice error={rooms.error} />
        <nav className="terminal-room-tabs" aria-label="Salones de mesas POS">
          {rooms.data?.data.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={room?.id === item.id}
              onClick={() => setRoomId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        {rooms.isPending ? (
          <Loading />
        ) : room ? (
          <OccupancyPanel key={room.id} room={room} onSelect={onSelect} />
        ) : (
          !rooms.error && <p>No hay salones activos en esta sucursal. Configúralos en Admin.</p>
        )}
        {rooms.data && rooms.data.meta.last_page > 1 && (
          <Pagination meta={rooms.data.meta} onPage={setPage} pending={rooms.isFetching} />
        )}
      </div>
    </Modal>
  )
}
