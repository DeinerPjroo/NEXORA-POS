import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { LockKeyhole } from 'lucide-react'
import { api } from '../../lib/api'
import type { ScreenSecurity } from '../../lib/types'
import { ErrorNotice, Field, Submit, useToast } from '../../components/ui'
import { useSession } from './SessionProvider'
import { screenChanged } from './screen-events'
import './security.css'

export function SecurityPage() {
  const { session, reload } = useSession()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [revision, setRevision] = useState(session!.security.revision)
  const mutation = useMutation({
    mutationFn: (remove: boolean) =>
      api<ScreenSecurity>('auth/security', {
        method: 'PUT',
        body: {
          current_password: password,
          pin: remove ? null : pin,
          pin_confirmation: remove ? null : confirm,
          revision,
        },
      }),
    onSuccess: (state) => {
      setRevision(state.revision)
      setPassword('')
      setPin('')
      setConfirm('')
      reload()
      screenChanged()
      toast('Tu PIN personal se actualizó.')
    },
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate(false)
  }
  return (
    <section className="security-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MI CUENTA</p>
          <h1>Seguridad personal</h1>
          <p>Protege tu acceso en este dispositivo.</p>
        </div>
        <LockKeyhole size={32} />
      </div>
      <div className="panel security-panel">
        <h2>Tu PIN de acceso rápido</h2>
        <p>
          {session?.security.pin_enabled
            ? 'Tienes un PIN configurado.'
            : 'Todavía no tienes un PIN.'}{' '}
          El PIN desbloquea tu sesión; para iniciar sesión y cambiarlo necesitas tu contraseña.
        </p>
        <form onSubmit={submit}>
          <Field label="Contraseña actual">
            <input
              type="password"
              autoComplete="current-password"
              maxLength={72}
              required
              value={password}
              disabled={mutation.isPending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Nuevo PIN de 6 dígitos">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="off"
              required
              value={pin}
              disabled={mutation.isPending}
              onChange={(event) => setPin(event.target.value)}
            />
          </Field>
          <Field label="Confirmar PIN">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="off"
              required
              value={confirm}
              disabled={mutation.isPending}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <ErrorNotice error={mutation.error} />
          <div className="form-actions">
            <Submit pending={mutation.isPending}>Guardar PIN</Submit>
            {session?.security.pin_enabled && (
              <button
                type="button"
                className="button secondary"
                disabled={!password || mutation.isPending}
                onClick={() => mutation.mutate(true)}
              >
                Quitar PIN
              </button>
            )}
            <button
              type="button"
              className="button ghost"
              disabled={mutation.isPending}
              onClick={() => {
                void api<ScreenSecurity>('auth/security')
                  .then((state) => {
                    setRevision(state.revision)
                    mutation.reset()
                    setPin('')
                    setConfirm('')
                    setPassword('')
                    reload()
                  })
                  .catch(() => toast('No se pudo actualizar. Intenta de nuevo.'))
              }}
            >
              Recargar configuración
            </button>
          </div>
        </form>
      </div>
      <p className="muted">
        Puedes bloquear desde la barra superior. La contraseña también permite desbloquear si
        olvidas el PIN. El bloqueo se aplica a las pestañas que comparten esta sesión; otras
        sesiones conservan su estado.
      </p>
    </section>
  )
}
