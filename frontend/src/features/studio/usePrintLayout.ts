import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useSession } from '../auth/SessionProvider'
import { parsePrintLayout, type PrintLayout } from './print-layout'

export function usePrintLayout(surface: 'receipt' | 'kitchen_print') {
  const { session, screenBlocked } = useSession()
  const [snapshot, setSnapshot] = useState<{ configuration: PrintLayout | null } | null>(null)
  const query = useQuery({
    queryKey: ['studio-print-active', surface, session?.user.id],
    queryFn: ({ signal }) =>
      api<{ data: { revision: number; configuration: unknown } }>(`studio/${surface}/active`, {
        signal,
      }),
    enabled: !!session && !screenBlocked && !snapshot,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  })
  useEffect(() => {
    if (snapshot || query.isFetching) return
    if (query.data)
      setSnapshot({
        configuration: query.data.data.revision
          ? parsePrintLayout(query.data.data.configuration)
          : null,
      })
    else if (query.isError) setSnapshot({ configuration: null })
  }, [snapshot, query.data, query.isFetching, query.isError])
  return { configuration: snapshot?.configuration ?? null, ready: !!snapshot }
}
