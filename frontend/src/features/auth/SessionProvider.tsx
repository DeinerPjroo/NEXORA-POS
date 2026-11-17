import { createContext, useContext, useEffect } from 'react'
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
}
const Context = createContext<SessionState>({
  session: null,
  pending: true,
  error: null,
  reload: () => {},
})
export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => api<Session>('auth/me', { signal }),
    retry: false,
    staleTime: 30_000,
  })
  const unauthorized = query.error instanceof ApiError && query.error.status === 401
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
