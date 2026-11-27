import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useCan, useSession } from '../auth/SessionProvider'

export function usePublishedOperationalLayout<T>(
  surface: 'tables' | 'kitchen' | 'deliveries',
  permission: string,
  parse: (value: unknown) => T | null,
  defaults: T,
  enabled: boolean,
  frozen: boolean,
  preview?: T,
) {
  const can = useCan()
  const { session } = useSession()
  const [device, setDevice] = useState(() =>
    window.innerWidth < 700 ? 'mobile' : window.innerWidth < 1200 ? 'tablet' : 'desktop',
  )
  const [applied, setApplied] = useState<T | null>(null)
  useEffect(() => {
    const resize = () =>
      setDevice(
        window.innerWidth < 700 ? 'mobile' : window.innerWidth < 1200 ? 'tablet' : 'desktop',
      )
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const query = useQuery({
    queryKey: [`studio-${surface}-active`, session?.user.id, device],
    queryFn: ({ signal }) =>
      api<{ data: { configuration: unknown; revision: number } }>(
        `studio/${surface}/active?device=${device}`,
        { signal },
      ),
    enabled: enabled && !frozen && !preview && can(permission),
    refetchInterval: enabled && !frozen && !preview ? 60000 : false,
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (!frozen && query.data)
      setApplied(
        query.data.data.revision ? (parse(query.data.data.configuration) ?? defaults) : null,
      )
  }, [frozen, query.data, parse, defaults])
  return preview ?? applied
}
