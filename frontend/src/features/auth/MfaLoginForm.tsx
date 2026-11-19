import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../lib/api'
import { ErrorNotice, Field } from '../../components/ui'

export function MfaLoginForm({
  onComplete,
  onCancel,
}: {
  onComplete: () => Promise<void>
  onCancel: () => void
}) {
  const [recovery, setRecovery] = useState(false)
  const [credential, setCredential] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api('auth/mfa/challenge', {
        method: 'POST',
        body: { method: recovery ? 'recovery' : 'totp', credential },
      })
      setCredential('')
      await onComplete()
    } catch (failure) {
      setError(failure)
      setCredential('')
    } finally {
      setPending(false)
    }
  }
  return (
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <h3>Confirma tu segundo factor</h3>
      <p className="muted">El desafío vence en cinco minutos. Aún no has ingresado a tu espacio.</p>
      <Field label={recovery ? 'Código de recuperación' : 'Código de tu aplicación'}>
        <input
          autoFocus
          type="password"
          autoComplete={recovery ? 'off' : 'one-time-code'}
          inputMode={recovery ? undefined : 'numeric'}
          pattern={recovery ? undefined : '[0-9]{6}'}
          maxLength={recovery ? 35 : 6}
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          required
          disabled={pending}
        />
      </Field>
      <ErrorNotice error={error} />
      <button className="button primary wide" type="submit" disabled={pending}>
        {pending ? 'Comprobando…' : 'Confirmar segundo factor'}
      </button>
      <button
        className="button ghost"
        type="button"
        disabled={pending}
        onClick={() => {
          setRecovery(!recovery)
          setCredential('')
          setError(null)
        }}
      >
        {recovery ? 'Usar aplicación autenticadora' : 'Usar código de recuperación'}
      </button>
      <button
        className="button ghost"
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true)
          void api('auth/mfa/cancel', { method: 'POST' })
            .then(onCancel)
            .catch(setError)
            .finally(() => setPending(false))
        }}
      >
        Volver al inicio de sesión
      </button>
    </form>
  )
}
