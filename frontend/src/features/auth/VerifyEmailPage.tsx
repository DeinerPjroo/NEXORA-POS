import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, PageTitle } from '../../components/ui'
import { useSession } from './SessionProvider'
import { verificationApiPath } from './verification-link'
import type { Session } from '../../lib/types'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { session } = useSession()
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const path = verificationApiPath(params.get('verificacion'))
  async function verify() {
    if (!path) return
    setPending(true)
    setError(null)
    try {
      await api(path, { method: 'POST' })
      const profile = await api<Session>('auth/me')
      client.setQueryData(['session'], profile)
      await client.invalidateQueries({ queryKey: ['email-verification'] })
      setDone(true)
    } catch (failure) {
      setError(failure)
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="panel security-panel">
      <PageTitle
        eyebrow="MI CUENTA"
        title="Verificar mi correo"
        description={session?.user.email ?? ''}
      />
      {done ? (
        <p className="notice" role="status">
          Tu correo está verificado.
        </p>
      ) : path ? (
        <>
          <p>
            Confirma para verificar el correo de esta cuenta. Si abriste el enlace con otra cuenta,
            cierra la sesión e ingresa con el correo al que se envió.
          </p>
          <button className="button primary" disabled={pending} onClick={() => void verify()}>
            {pending ? 'Verificando…' : 'Confirmar verificación'}
          </button>
        </>
      ) : (
        <p className="notice error" role="alert">
          El enlace no es válido. Solicita uno nuevo desde Seguridad personal.
        </p>
      )}
      <ErrorNotice error={error} />
      <Link className="button ghost" to="/mi-seguridad">
        Ir a Seguridad personal
      </Link>
    </section>
  )
}
