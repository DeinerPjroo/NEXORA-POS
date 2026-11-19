import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice } from '../../components/ui'
import { useSession } from './SessionProvider'

export function EmailVerificationPanel() {
  const { session } = useSession()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<unknown>(null)
  const status = useQuery({
    queryKey: ['email-verification'],
    queryFn: ({ signal }) =>
      api<{ verified: boolean; delivery_available: boolean }>('auth/email-verification', {
        signal,
      }),
    retry: false,
  })
  const verified = status.data?.verified ?? !!session?.user.email_verified_at
  async function send() {
    setPending(true)
    setError(null)
    setMessage('')
    try {
      const response = await api<{ message: string }>('auth/email-verification', { method: 'POST' })
      setMessage(response.message)
    } catch (failure) {
      setError(failure)
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="panel security-panel email-verification-panel">
      <MailCheck size={26} />
      <h2>Correo de tu cuenta</h2>
      <p>{session?.user.email}</p>
      <p role="status">{verified ? 'Correo verificado' : 'Correo pendiente de verificación'}</p>
      {!verified && (
        <>
          <p>
            Solicita un enlace personal y ábrelo con esta misma cuenta. El enlace vence en 60
            minutos.
          </p>
          {status.data && !status.data.delivery_available && (
            <p className="notice">
              El servicio de correo todavía no está configurado. No se enviará un enlace hasta que
              esté disponible.
            </p>
          )}
          <button
            className="button secondary"
            onClick={() => void send()}
            disabled={pending || !status.data?.delivery_available}
          >
            {pending ? 'Solicitando…' : 'Solicitar enlace de verificación'}
          </button>
        </>
      )}
      <ErrorNotice error={status.error || error} />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <button
        className="button ghost"
        disabled={status.isFetching || pending}
        onClick={() => void status.refetch()}
      >
        Actualizar estado del correo
      </button>
    </section>
  )
}
