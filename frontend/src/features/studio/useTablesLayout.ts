import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useCan, useSession } from '../auth/SessionProvider'
import { defaultTablesLayout, parseTablesLayout, type TablesLayout } from './tables-layout'

export function useTablesLayout(enabled: boolean, frozen: boolean, preview?: TablesLayout) {
  const can = useCan()
  const { session } = useSession()
  const [device, setDevice] = useState(() =>
    window.innerWidth < 700 ? 'mobile' : window.innerWidth < 1200 ? 'tablet' : 'desktop',
  )
  const [applied, setApplied] = useState<TablesLayout | null>(null)
  useEffect(() => {
    const resize = () =>
      setDevice(
        window.innerWidth < 700 ? 'mobile' : window.innerWidth < 1200 ? 'tablet' : 'desktop',
      )
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const query = useQuery({
    queryKey: ['studio-tables-active', session?.user.id, device],
    queryFn: ({ signal }) =>
      api<{ data: { configuration: unknown; revision: number } }>(
        `studio/tables/active?device=${device}`,
        { signal },
      ),
    enabled: enabled && !frozen && !preview && can('dining.view'),
    refetchInterval: enabled && !frozen && !preview ? 60000 : false,
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (!frozen && query.data)
      setApplied(
        query.data.data.revision
          ? (parseTablesLayout(query.data.data.configuration) ?? defaultTablesLayout)
          : null,
      )
  }, [frozen, query.data])
  return preview ?? applied
}
