import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Field } from '../../components/ui'
import { useSession } from './SessionProvider'

type MfaState = { enabled: boolean; revision: number; recovery_remaining: number }
type Enrollment = { secret: string; qr_image: string; revision: number; pending_id: string }

export function MfaPanel() {
  const client = useQueryClient()
  const { reload } = useSession()
  const status = useQuery({
    queryKey: ['mfa-state'],
    queryFn: ({ signal }) => api<MfaState>('auth/mfa', { signal }),
    retry: false,
  })
  const [revision, setRevision] = useState<number | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [credential, setCredential] = useState('')
  const [method, setMethod] = useState('totp')
  const [action, setAction] = useState('recovery-codes')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    if (revision === null && status.data) setRevision(status.data.revision)
  }, [revision, status.data])
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const body = {
        current_password: password,
        revision,
        credential,
        method,
        ...(enrollment ? { pending_id: enrollment.pending_id } : {}),
      }
      if (!status.data?.enabled && !enrollment) {
        const setup = await api<Enrollment>('auth/mfa/setup', { method: 'POST', body })
        setEnrollment(setup)
        setRevision(setup.revision)
      } else {
        const response = await api<MfaState & { recovery_codes: string[] }>(
          `auth/mfa/${enrollment ? 'enable' : action}`,
          { method: 'POST', body },
        )
        client.setQueryData<MfaState>(['mfa-state'], {
          enabled: response.enabled,
          revision: response.revision,
          recovery_remaining: response.recovery_remaining,
        })
        setRevision(response.revision)
        setCodes(response.recovery_codes)
        setEnrollment(null)
        setPassword('')
        setCredential('')
        reload()
      }
      await status.refetch()
    } catch (failure) {
      setError(failure)
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="panel security-panel mfa-panel">
      <ShieldCheck size={26} />
      <h2>Autenticación en dos pasos</h2>
      <p role="status">{status.data?.enabled ? 'MFA activo' : 'MFA sin activar'}</p>
      <p>
        Además de tu contraseña, usa una aplicación autenticadora o un código de recuperación.
        Configurar MFA cierra las otras sesiones.
      </p>
      <ErrorNotice error={status.error || error} />
      {codes.length > 0 ? (
        <div className="mfa-recovery">
          <h3>Guarda tus códigos de recuperación</h3>
          <p>
            Cada código funciona una sola vez. Guarda esta lista en un lugar seguro; al cerrarla no
            podrás volver a verla. Para ingresar con la aplicación, espera su siguiente código
            nuevo.
          </p>
          <ul aria-label="Códigos de recuperación">
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <button type="button" className="button primary" onClick={() => setCodes([])}>
            Ya guardé mis códigos
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          {enrollment && (
            <div className="mfa-enrollment">
              <p>
                Escanea el QR en tu aplicación o ingresa la clave manualmente. Confirma un código
                dentro de diez minutos.
              </p>
              <img
                src={enrollment.qr_image}
                width={240}
                height={240}
                alt="QR para configurar tu aplicación autenticadora"
              />
              <p>
                Clave de configuración:{' '}
                <code data-testid="mfa-enrollment-secret">{enrollment.secret}</code>
              </p>
            </div>
          )}
          {status.data?.enabled && (
            <>
              <p>Quedan {status.data.recovery_remaining} códigos de recuperación.</p>
              <Field label="Acción MFA">
                <select
                  value={action}
                  disabled={pending}
                  onChange={(event) => setAction(event.target.value)}
                >
                  <option value="recovery-codes">Generar nuevos códigos de recuperación</option>
                  <option value="disable">Desactivar MFA</option>
                </select>
              </Field>
              <Field label="Segundo factor">
                <select
                  value={method}
                  disabled={pending}
                  onChange={(event) => {
                    setMethod(event.target.value)
                    setCredential('')
                  }}
                >
                  <option value="totp">Aplicación autenticadora</option>
                  <option value="recovery">Código de recuperación</option>
                </select>
              </Field>
            </>
          )}
          <Field label="Contraseña para MFA">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={72}
              required
              disabled={pending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {(enrollment || status.data?.enabled) && (
            <Field
              label={
                enrollment || method === 'totp'
                  ? 'Código MFA de la aplicación'
                  : 'Código MFA de recuperación'
              }
            >
              <input
                type="password"
                autoComplete="off"
                inputMode={enrollment || method === 'totp' ? 'numeric' : undefined}
                maxLength={enrollment || method === 'totp' ? 6 : 35}
                pattern={enrollment || method === 'totp' ? '[0-9]{6}' : undefined}
                required
                value={credential}
                disabled={pending}
                onChange={(event) => setCredential(event.target.value)}
              />
            </Field>
          )}
          <div className="form-actions">
            <button
              className="button primary"
              disabled={pending || !status.data || revision === null}
            >
              {pending
                ? 'Comprobando…'
                : enrollment
                  ? 'Activar MFA'
                  : status.data?.enabled
                    ? action === 'disable'
                      ? 'Desactivar MFA'
                      : 'Renovar códigos de recuperación'
                    : 'Configurar aplicación'}
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={pending}
              onClick={() => {
                setEnrollment(null)
                setPassword('')
                setCredential('')
                setError(null)
                void status.refetch().then((response) => {
                  if (response.data) setRevision(response.data.revision)
                })
              }}
            >
              Recargar MFA
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
