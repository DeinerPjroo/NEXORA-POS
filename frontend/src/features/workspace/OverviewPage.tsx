import { Link } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  Clock3,
  Fingerprint,
  Layers3,
  Paintbrush,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { Activity } from '../../lib/types'
import { ErrorNotice, Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'

type Overview = {
  // El resumen administrativo existente se conserva debajo del panel comercial.
  branches: number
  active_branches: number
  team: number
  roles: number
  theme_revision: number
  activity: Activity[]
}
const CommercialPanel = lazy(() =>
  import('../dashboard/CommercialPanel').then((module) => ({ default: module.CommercialPanel })),
)

export function OverviewPage() {
  const { session } = useSession()
  const can = useCan()
  const query = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('workspace/overview'),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <ErrorNotice error={query.error} />
  const data = query.data!
  const date = new Intl.DateTimeFormat(session!.company.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: session!.company.timezone,
  }).format(new Date())
  const steps = [
    {
      title: 'Tu restaurante ya tiene su espacio',
      description: 'Empresa y sucursal principal registradas.',
      complete: true,
      to: '/configuracion',
      permission: 'settings.view',
    },
    {
      title: 'Dale tu propia identidad',
      description: 'Elige los colores y el estilo de tu negocio.',
      complete: data.theme_revision > 1,
      to: '/studio',
      permission: 'studio.view',
    },
    {
      title: 'Organiza tus sucursales',
      description: 'Completa la ubicación y los datos de cada sede.',
      complete: data.branches > 1,
      to: '/sucursales',
      permission: 'branches.view',
    },
  ]
  return (
    <>
      <PageTitle
        eyebrow="TU CENTRO DE CONTROL"
        title={`Hola, ${session!.user.name.split(' ')[0]} 👋`}
        description="Un nuevo día para construir algo extraordinario."
        action={
          <span className="date-label">
            <Clock3 size={15} />
            {date}
          </span>
        }
      />
      <Suspense fallback={<Loading />}>
        <CommercialPanel />
      </Suspense>
      <details className="overview-workspace">
        <summary>Tu empresa e identidad visual</summary>
        <section className="welcome-banner">
          <div className="welcome-copy">
            <span className="banner-label">
              <span className="status-dot" /> TU ESPACIO ESTÁ LISTO
            </span>
            <h2>
              El siguiente capítulo
              <br />
              de tu restaurante empieza aquí.
            </h2>
            <p>
              Un lugar para conectar tu equipo, darle vida a tu marca
              <br className="desktop-break" /> y preparar todo lo que viene.
            </p>
            {can('studio.view') && (
              <Link className="button primary" to="/studio">
                <Sparkles size={16} /> Hazlo tuyo <ArrowUpRight size={17} />
              </Link>
            )}
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="art-ring ring-a" />
            <div className="art-ring ring-b" />
            <div className="art-ring ring-c" />
            <div className="art-square">
              <UtensilsCrossed size={46} strokeWidth={1.3} />
            </div>
            <span className="art-label">
              <CheckCheck size={16} /> Todo empieza con una idea
            </span>
            <span className="art-star">✳</span>
          </div>
        </section>
        <div className="metrics-grid">
          {[
            {
              label: 'Sucursales',
              value: data.branches,
              detail: `${data.active_branches} activas en tu empresa`,
              icon: Building2,
              color: 'cyan',
            },
            {
              label: 'Personas en tu equipo',
              value: data.team,
              detail: 'Cuentas registradas',
              icon: Users,
              color: 'violet',
            },
            {
              label: 'Roles configurados',
              value: data.roles,
              detail: 'Accesos según cada responsabilidad',
              icon: ShieldCheck,
              color: 'green',
            },
            {
              label: 'Tu identidad visual',
              value: `v${data.theme_revision}`,
              detail:
                data.theme_revision === 1
                  ? 'Diseño Nexora predeterminado'
                  : 'Diseño personalizado publicado',
              icon: Paintbrush,
              color: 'amber',
            },
          ].map(({ label, value, detail, icon: Icon, color }) => (
            <section className="metric-card" key={label}>
              <div>
                <span>{label}</span>
                <div className={`metric-icon ${color}`}>
                  <Icon size={19} />
                </div>
              </div>
              <strong>{value}</strong>
              <p>{detail}</p>
            </section>
          ))}
        </div>
        <div className="overview-grid">
          <section className="panel setup-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">LOS PRIMEROS PASOS</p>
                <h2>Construye tu espacio</h2>
              </div>
              <span className="count-badge">
                {steps.filter((step) => step.complete).length} de 3
              </span>
            </div>
            <div className="progress-track">
              <span
                style={{ width: `${(steps.filter((step) => step.complete).length / 3) * 100}%` }}
              />
            </div>
            {steps.map((step, index) => (
              <div className="setup-step" key={step.title}>
                <span className={`step-number ${step.complete ? 'complete' : ''}`}>
                  {step.complete ? <Check size={17} /> : `0${index + 1}`}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                {can(step.permission) && (
                  <Link className="icon-button" to={step.to} aria-label={step.title}>
                    <ArrowRight size={18} />
                  </Link>
                )}
              </div>
            ))}
            <div className="setup-note">
              <Fingerprint size={16} />
              <span>Un espacio independiente. Una identidad propia.</span>
            </div>
          </section>
          <section className="studio-feature">
            <div className="studio-feature-top">
              <span className="pill violet">
                <Sparkles size={13} /> NEXORA STUDIO
              </span>
              <ArrowUpRight size={21} />
            </div>
            <div className="palette-art" aria-hidden="true">
              <i style={{ background: session!.settings.theme.primary }} />
              <i style={{ background: session!.settings.theme.secondary }} />
              <i />
              <i />
            </div>
            <h2>
              Tu marca.
              <br />
              En cada detalle.
            </h2>
            <p>
              Colores, apariencia y personalidad.
              <br />
              Crea un sistema que se sienta tuyo.
            </p>
            {can('studio.view') && (
              <Link to="/studio">
                Explorar mi identidad <ArrowRight size={17} />
              </Link>
            )}
            <span className="feature-index">01 / IDENTIDAD VISUAL</span>
          </section>
        </div>
        <div className="overview-bottom">
          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">TODO EN SU LUGAR</p>
                <h2>Actividad reciente</h2>
              </div>
              <span className="pill neutral">Tu empresa</span>
            </div>
            {data.activity.length ? (
              <div className="activity-list">
                {data.activity.map((activity) => (
                  <div className="activity-row" key={activity.id}>
                    <span className="activity-icon">
                      {activity.action.startsWith('theme') ? (
                        <Paintbrush size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                    </span>
                    <div>
                      <p>{activity.description}</p>
                      <small>
                        {new Intl.DateTimeFormat('es-CO', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: session!.company.timezone,
                        }).format(new Date(activity.created_at))}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted empty-inline">
                {can('audit.view')
                  ? 'Aquí aparecerá la actividad de tu empresa.'
                  : 'La consulta de actividad requiere permiso de auditoría.'}
              </p>
            )}
          </section>
          <section className="next-chapter">
            <span className="metric-icon cyan">
              <Layers3 size={21} />
            </span>
            <p className="eyebrow">LO QUE VIENE</p>
            <h2>Preparados para crecer contigo.</h2>
            <p>Cocina, inventario y reportes avanzados continuarán por etapas sobre esta base.</p>
            <Link to="/acerca">
              Conoce el camino <ArrowUpRight size={16} />
            </Link>
            <div className="next-tags">
              <span>Punto de venta</span>
              <span>Cocina</span>
              <span>Inventario</span>
            </div>
          </section>
        </div>
      </details>
    </>
  )
}
