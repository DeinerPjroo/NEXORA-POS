import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '../../lib/types'
import { api, ApiError } from '../../lib/api'
import { foreground } from '../../lib/theme'

type SessionState = {
  session: Session | null
  pending: boolean
  error: unknown
  reload: () => void
  screenBlocked: boolean
}
const Context = createContext<SessionState>({
  session: null,
  pending: true,
  error: null,
  reload: () => {},
  screenBlocked: false,
})
export function SessionProvider({ children }: { children: ReactNode }) {
  const [screenBlocked, setScreenBlocked] = useState(false)
  const query = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => api<Session>('auth/me', { signal }),
    retry: false,
    staleTime: 30_000,
  })
  const unauthorized = query.error instanceof ApiError && query.error.status === 401
  useEffect(() => {
    if (query.data) setScreenBlocked(query.data.security.locked)
    if (unauthorized) setScreenBlocked(false)
  }, [query.data, query.dataUpdatedAt, unauthorized])
  useEffect(() => {
    const refresh = () => {
      void query.refetch()
    }
    const block = () => {
      setScreenBlocked(true)
      refresh()
    }
    // A peer message may be a lock: mask immediately and obtain authority from the API.
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('nexora:screen')
    if (channel) channel.onmessage = block
    window.addEventListener('nexora:screen-locked', block)
    window.addEventListener('nexora:screen-changed', refresh)
    return () => {
      channel?.close()
      window.removeEventListener('nexora:screen-locked', block)
      window.removeEventListener('nexora:screen-changed', refresh)
    }
  }, [query.refetch])
  useEffect(() => {
    const theme = query.data?.settings.theme
    const root = document.documentElement
    root.style.setProperty('--accent', theme?.primary ?? '#31D9FC')
    root.style.setProperty('--on-accent', foreground(theme?.primary ?? '#31D9FC'))
    root.style.setProperty('--secondary', theme?.secondary ?? '#8271FF')
    root.dataset.theme = theme?.mode ?? 'light'
    root.dataset.radius = theme?.radius ?? 'rounded'
  }, [query.data])
  return (
    <Context.Provider
      value={{
        session: unauthorized ? null : (query.data ?? null),
        pending: query.isPending,
        error: unauthorized ? null : query.error,
        reload: () => {
          void query.refetch()
        },
        screenBlocked: screenBlocked || !!query.data?.security.locked,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useSession() {
  return useContext(Context)
}
export function useCan() {
  const { session } = useSession()
  return (permission: string) => session?.permissions.includes(permission) ?? false
}
