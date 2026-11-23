import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useCan, useSession } from '../auth/SessionProvider'
import { defaultPosConfiguration, parsePosLayout, type PosLayout } from './pos-layout'

export function usePosLayout(enabled: boolean, frozen: boolean, preview?: PosLayout) {
  const can = useCan()
  const { session } = useSession()
  const [applied, setApplied] = useState<{ configuration: PosLayout; revision: number }>({
    configuration: defaultPosConfiguration,
    revision: 0,
  })
  const query = useQuery({
    queryKey: ['studio-pos-active', session?.user.id],
    queryFn: ({ signal }) =>
      api<{ data: { configuration: unknown; revision: number } }>('studio/pos/active', { signal }),
    enabled: enabled && !preview && can('orders.manage') && can('catalog.view') && !frozen,
    refetchInterval: frozen || !enabled || preview ? false : 60000,
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (frozen || !query.data) return
    setApplied({
      configuration: parsePosLayout(query.data.data.configuration) ?? defaultPosConfiguration,
      revision: query.data.data.revision,
    })
  }, [frozen, query.data])
  return preview
    ? { configuration: parsePosLayout(preview) ?? defaultPosConfiguration, revision: -1 }
    : applied
}
