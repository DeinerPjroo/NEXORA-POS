import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Globe2, Laptop, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import type { Company } from '../../lib/types'
import { businessTypes } from '../../lib/types'
import { ErrorNotice, Field, PageTitle, Submit, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'

type DeviceSession = {
  current: boolean
  ip_address: string
  user_agent: string
  last_activity: number
}
export function SettingsPage() {
  const { session } = useSession()
  const can = useCan()
  const client = useQueryClient()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const sessions = useQuery({
    queryKey: ['devices'],
    queryFn: () => api<DeviceSession[]>('auth/sessions'),
  })
  const mutation = useMutation({
    mutationFn: (body: unknown) => api<Company>('workspace/company', { method: 'PUT', body }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['session'] })
      toast('Información de la empresa actualizada.')
    },
  })
  const revoke = useMutation({
    mutationFn: () => api('auth/sessions', { method: 'DELETE', body: { password } }),
    onSuccess: async () => {
      await sessions.refetch()
      setPassword('')
      toast('Se cerraron las otras sesiones.')
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutation.mutate(Object.fromEntries(new FormData(event.currentTarget)))
  }
  return (
    <>
      <PageTitle
        eyebrow="TODO A TU MANERA"
        title="Configuración de tu espacio"
        description="Los detalles que hacen que tu sistema se adapte a tu negocio."
      />
      <div className="settings-layout">
        <form className="panel form-stack settings-form" onSubmit={submit}>
          <div className="panel-heading">
            <h2>
              <Building2 size={19} />
              Tu empresa
            </h2>
            <span className="pill neutral">Configuración general</span>
          </div>
          <ErrorNotice error={mutation.error} />
          <fieldset disabled={!can('settings.manage')} className="form-stack">
            <legend className="sr-only">Datos de la empresa</legend>
            <Field label="Nombre comercial">
              <input name="name" required maxLength={120} defaultValue={session!.company.name} />
            </Field>
            <Field label="Tipo de establecimiento">
              <select name="business_type" defaultValue={session!.company.business_type}>
                {businessTypes.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-divider">
              <Globe2 size={17} />
              <h3>Preferencias regionales</h3>
            </div>
            <div className="form-grid">
              <Field label="Moneda">
                <select name="currency" defaultValue={session!.company.currency}>
                  <option value="COP">COP · Peso colombiano</option>
                  <option value="USD">USD · Dólar estadounidense</option>
                  <option value="EUR">EUR · Euro</option>
                </select>
              </Field>
              <Field label="Idioma">
                <select name="locale" defaultValue={session!.company.locale}>
                  <option value="es-CO">Español · Colombia</option>
                </select>
              </Field>
            </div>
            <Field label="Zona horaria">
              <select name="timezone" defaultValue={session!.company.timezone}>
                {Array.from(
                  new Set([
                    session!.company.timezone,
                    'America/Bogota',
                    'America/Mexico_City',
                    'America/Lima',
                    'America/Santiago',
                    'America/Argentina/Buenos_Aires',
                    'Europe/Madrid',
                    'UTC',
                  ]),
                ).map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
            </Field>
          </fieldset>
          <div className="form-actions">
            <Submit pending={mutation.isPending} disabled={!can('settings.manage')} />
          </div>
        </form>
        <aside className="settings-aside">
          <div className="panel security-card">
            <span className="metric-icon green">
              <ShieldCheck size={24} />
            </span>
            <h2>Tu espacio es independiente.</h2>
            <p>
              La información de tu empresa está separada de los demás establecimientos en Nexora.
            </p>
            <div className="identity-code">
              <span>IDENTIFICADOR DE EMPRESA</span>
              <code>{session!.company.public_id}</code>
            </div>
            <p className="small muted">
              Los permisos y el aislamiento de datos se aplican desde el servidor.
            </p>
          </div>
        </aside>
      </div>
      <section className="panel sessions-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TU CUENTA, BAJO CONTROL</p>
            <h2>
              <Laptop size={19} />
              Sesiones activas
            </h2>
          </div>
        </div>
        <ErrorNotice error={sessions.error ?? revoke.error} />
        <div className="device-list">
          {sessions.data?.map((device, index) => (
            <div className="device-row" key={index}>
              <Laptop size={20} />
              <div>
                <strong>{device.current ? 'Este dispositivo' : 'Otro dispositivo'}</strong>
                <small>
                  {device.ip_address} ·{' '}
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: session!.company.timezone,
                  }).format(new Date(device.last_activity * 1000))}
                </small>
                <span title={device.user_agent}>{device.user_agent}</span>
              </div>
              {device.current && <span className="pill green">Sesión actual</span>}
            </div>
          ))}
        </div>
        <form
          className="revoke-form"
          onSubmit={(event) => {
            event.preventDefault()
            revoke.mutate()
          }}
        >
          <Field label="Confirma tu contraseña para cerrar las otras sesiones">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu contraseña actual"
            />
          </Field>
          <Submit pending={revoke.isPending}>Cerrar otras sesiones</Submit>
        </form>
      </section>
    </>
  )
}
