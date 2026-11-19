import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LockKeyhole } from 'lucide-react'
import { api } from '../../lib/api'
import type { Session } from '../../lib/types'
import { Brand, ErrorNotice, Field, Submit } from '../../components/ui'
import { useSession } from './SessionProvider'
import { screenChanged } from './screen-events'
import './security.css'

export function ScreenLock({ logout }: { logout: () => Promise<void> }) {
  const { session, reload } = useSession()
  const client = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const [password, setPassword] = useState(false)
  const [credential, setCredential] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const pin = !!session?.security.pin_enabled && !password
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  async function unlock(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api('auth/screen/unlock', {
        method: 'POST',
        body: {
          challenge: session?.security.challenge,
          method: pin ? 'pin' : 'password',
          credential,
        },
      })
      setCredential('')
      const profile = await api<Session>('auth/me')
      client.setQueryData(['session'], profile)
      screenChanged()
    } catch (failure) {
      setError(failure)
      setCredential('')
      reload()
    } finally {
      setPending(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="screen-lock"
      aria-label="Pantalla bloqueada"
      onCancel={(event) => event.preventDefault()}
    >
      <Brand />
      <div className="security-symbol">
        <LockKeyhole size={28} />
      </div>
      <h1>Pantalla bloqueada</h1>
      <p>Hola, {session?.user.name}. Desbloquea para continuar donde estabas.</p>
      <form onSubmit={(event) => void unlock(event)}>
        <Field label={pin ? 'Tu PIN de 6 dígitos' : 'Tu contraseña'}>
          <input
            autoFocus
            type="password"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            autoComplete={pin ? 'off' : 'current-password'}
            inputMode={pin ? 'numeric' : undefined}
            pattern={pin ? '[0-9]{6}' : undefined}
            maxLength={pin ? 6 : 72}
            required
            disabled={pending || !session?.security.challenge}
          />
        </Field>
        <ErrorNotice error={error} />
        <Submit pending={pending} disabled={!session?.security.challenge}>
          Desbloquear
        </Submit>
      </form>
      {session?.security.pin_enabled && (
        <button
          className="button ghost"
          disabled={pending}
          onClick={() => {
            setPassword(!password)
            setCredential('')
            setError(null)
          }}
        >
          {password ? 'Usar mi PIN' : 'Usar mi contraseña'}
        </button>
      )}
      <button className="button ghost" onClick={reload} disabled={pending}>
        Actualizar estado
      </button>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() => {
          setPending(true)
          void logout().finally(() => setPending(false))
        }}
      >
        Cerrar sesión
      </button>
    </dialog>
  )
}
