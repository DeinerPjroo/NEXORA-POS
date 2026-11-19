import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Loading } from '../../components/ui'
import { OrderComposer } from '../orders/OrderComposer'
import type { DiningSession } from './session-types'
export function DiningPosPage() {
  const { sessionId } = useParams()
  const query = useQuery({
    queryKey: ['dining-session', 'pos', sessionId],
    queryFn: ({ signal }) =>
      api<{ data: DiningSession }>('dining-sessions/' + sessionId, { signal }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })
  if (query.isPending) return <Loading />
  if (!query.data) return <ErrorNotice error={query.error} />
  return <DiningPosReady key={query.data.data.id} initialSession={query.data.data} />
}

function DiningPosReady({ initialSession }: { initialSession: DiningSession }) {
  const [s] = useState(() => structuredClone(initialSession))
  if (s.status !== 'open')
    return (
      <p className="notice">
        Esta atención ya está cerrada. Abre una atención para tomar otro pedido.
      </p>
    )
  return (
    <OrderComposer
      key={s.id}
      terminal
      initialDining={{
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
      }}
    />
  )
}
