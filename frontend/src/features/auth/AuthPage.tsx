import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Command,
  Eye,
  EyeOff,
  Fingerprint,
  Layers3,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api } from '../../lib/api'
import { businessTypes } from '../../lib/types'
import { Brand, ErrorNotice, Field, Loading } from '../../components/ui'
import { useSession } from './SessionProvider'
import { homePath } from './home'
import type { Session } from '../../lib/types'
import { verificationReturn } from './verification-link'

type Mode = 'login' | 'register' | 'forgot' | 'reset'
export function AuthPage({ mode = 'login' }: { mode?: Mode }) {
  const { session, pending, error, reload } = useSession()
  const [visible, setVisible] = useState(false)
  const [done, setDone] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const titles = {
    login: ['Tu próximo gran paso.', 'Qué bueno tenerte de vuelta. Entra a tu espacio de trabajo.'],
    register: ['Todo empieza contigo.', 'Crea el espacio de trabajo de tu restaurante.'],
    forgot: ['Recupera tu acceso.', 'Escribe el correo asociado a tu cuenta.'],
    reset: ['Un nuevo comienzo.', 'Elige una contraseña segura para tu cuenta.'],
  }
  const mutation = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api<{ message: string }>(
        `auth/${{ login: 'login', register: 'register', forgot: 'forgot-password', reset: 'reset-password' }[mode]}`,
        { method: 'POST', body },
      ),
    onSuccess: async () => {
      if (mode === 'forgot' || mode === 'reset') {
        setDone(true)
        return
      }
      const profile = await api<Session>('auth/me')
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
      client.getMutationCache().clear()
      client.setQueryData(['session'], profile)
      navigate(verificationReturn(params.get('verificar')) ?? homePath(profile), { replace: true })
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    if (mode === 'reset') {
      data.token = params.get('token') ?? ''
      data.email = params.get('email') ?? ''
    }
    mutation.mutate(data)
  }
  if (pending) return <Loading />
  if (session)
    return (
      <Navigate to={verificationReturn(params.get('verificar')) ?? homePath(session)} replace />
    )
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <span className="edition">
          <span className="status-dot" /> UNA NUEVA FORMA DE GESTIONAR
        </span>
        <div className="story-copy">
          <h1>
            Tu restaurante.
            <br />
            Tus reglas.
            <br />
            <span>Sin límites.</span>
          </h1>
          <p>
            La tecnología se adapta a ti.
            <br />
            Dale a tu negocio el espacio para crecer.
          </p>
        </div>
        <div className="orbital" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="orbit-core">
            <Command size={44} strokeWidth={1.2} />
          </div>
          <span className="orbit-chip chip-one">
            <Layers3 size={17} /> Todo conectado
          </span>
          <span className="orbit-chip chip-two">
            <Sparkles size={17} /> A tu manera
          </span>
          <i className="orbit-dot dot-one" />
          <i className="orbit-dot dot-two" />
        </div>
        <div className="story-footer">
          <p>El futuro de tu restaurante.</p>
          <span>
            NEXORA POS <span> / </span> HECHO PARA EVOLUCIONAR
          </span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Brand compact />
          <span>{mode === 'login' ? '¿Nuevo en Nexora?' : '¿Ya tienes una cuenta?'}</span>
          <Link to={mode === 'login' ? '/registro' : '/ingresar'}>
            {mode === 'login' ? 'Crear mi espacio' : 'Iniciar sesión'} <ArrowRight size={15} />
          </Link>
        </div>
        <div className={`auth-form-wrap ${mode === 'register' ? 'registration' : ''}`}>
          <div className="form-emblem">
            <Fingerprint size={27} />
          </div>
          <p className="eyebrow">
            {mode === 'register' ? 'BIENVENIDO A NEXORA' : 'TU ESPACIO, CONECTADO'}
          </p>
          <h2>{titles[mode][0]}</h2>
          <p className="muted">{titles[mode][1]}</p>
          <ErrorNotice error={error ?? mutation.error} />
          {Boolean(error) && (
            <button className="button secondary" onClick={reload}>
              Reintentar conexión
            </button>
          )}
          {done ? (
            <div className="success-state" role="status">
              <Check size={28} />
              <h3>{mode === 'forgot' ? 'Revisa tu correo' : 'Contraseña actualizada'}</h3>
              <p>
                {mode === 'forgot'
                  ? 'Si el correo está registrado, recibirás un enlace para recuperar tu acceso.'
                  : 'Ya puedes entrar con tu nueva contraseña.'}
              </p>
              <Link className="button primary" to="/ingresar">
                Volver a iniciar sesión <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack">
              {mode === 'register' && (
                <>
                  <div className="form-grid">
                    <Field label="Nombre del restaurante">
                      <input
                        name="company_name"
                        required
                        maxLength={120}
                        autoComplete="organization"
                        placeholder="Ej. Casa Oliva"
                      />
                    </Field>
                    <Field label="Tipo de establecimiento">
                      <select name="business_type">
                        {businessTypes.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Primera sucursal">
                    <input
                      name="branch_name"
                      required
                      maxLength={100}
                      defaultValue="Sede principal"
                    />
                  </Field>
                  <Field label="Tu nombre">
                    <input
                      name="name"
                      required
                      maxLength={100}
                      autoComplete="name"
                      placeholder="¿Cómo te llamas?"
                    />
                  </Field>
                </>
              )}
              {mode !== 'reset' && (
                <Field label="Correo electrónico">
                  <input
                    type="email"
                    name="email"
                    required
                    maxLength={190}
                    autoComplete="email"
                    placeholder="tu@restaurante.com"
                  />
                </Field>
              )}
              {mode !== 'forgot' && (
                <Field
                  label="Contraseña"
                  hint={
                    mode === 'login'
                      ? undefined
                      : 'Mínimo 12 caracteres, mayúsculas, minúsculas y un número.'
                  }
                >
                  <div className="password-input">
                    <input
                      type={visible ? 'text' : 'password'}
                      name="password"
                      required
                      minLength={mode === 'login' ? 1 : 12}
                      maxLength={200}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder={
                        mode === 'login' ? 'Ingresa tu contraseña' : 'Crea una contraseña segura'
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>
              )}
              {(mode === 'register' || mode === 'reset') && (
                <Field label="Confirma tu contraseña">
                  <input
                    type="password"
                    name="password_confirmation"
                    required
                    minLength={12}
                    maxLength={200}
                    autoComplete="new-password"
                  />
                </Field>
              )}
              {mode === 'login' && (
                <div className="forgot-link">
                  <span>
                    <ShieldCheck size={14} /> Acceso seguro
                  </span>
                  <Link to="/recuperar">Olvidé mi contraseña</Link>
                </div>
              )}
              <button type="submit" className="button primary wide" disabled={mutation.isPending}>
                {mutation.isPending
                  ? 'Un momento…'
                  : {
                      login: 'Entrar a mi espacio',
                      register: 'Crear mi espacio de trabajo',
                      forgot: 'Solicitar enlace',
                      reset: 'Actualizar contraseña',
                    }[mode]}
                <ArrowRight size={18} />
              </button>
              {mode === 'register' && (
                <p className="form-note">
                  Crearás una empresa independiente con su primera sucursal y tu cuenta de
                  propietario.
                </p>
              )}
            </form>
          )}
          <div className="auth-trust">
            <span>
              <ShieldCheck size={16} /> Tu información, protegida
            </span>
            <span className="tiny-divider" />
            <span>Diseñado para tu negocio</span>
          </div>
        </div>
        <footer className="auth-bottom">
          <span>© {new Date().getFullYear()} Nexora</span>
          <span>El futuro de tu restaurante.</span>
          <span>Español · Colombia</span>
        </footer>
      </main>
    </div>
  )
}
