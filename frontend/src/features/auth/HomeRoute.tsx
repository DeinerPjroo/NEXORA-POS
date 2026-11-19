import { Navigate } from 'react-router-dom'
import { Loading } from '../../components/ui'
import { useSession } from './SessionProvider'
import { homePath } from './home'

export function HomeRoute() {
  const { session, pending } = useSession()
  if (pending) return <Loading />
  return <Navigate to={session ? homePath(session) : '/ingresar'} replace />
}
