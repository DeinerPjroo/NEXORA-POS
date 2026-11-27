import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  History,
  LayoutDashboard,
  Monitor,
  Moon,
  Paintbrush,
  RotateCcw,
  Sparkles,
  Sun,
  UtensilsCrossed,
} from 'lucide-react'
import { api } from '../../lib/api'
import { foreground } from '../../lib/theme'
import type { Settings, Theme } from '../../lib/types'
import { ErrorNotice, Field, Loading, PageTitle, Submit, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { Link } from 'react-router-dom'
import './studio-layout.css'

type ThemeVersion = { id: number; version: number; theme: Theme; created_at: string }
type StudioData = { settings: Settings; versions: ThemeVersion[]; defaults: Theme }
export function StudioPage() {
  const query = useQuery({
    queryKey: ['studio'],
    queryFn: () => api<StudioData>('workspace/theme'),
  })
  return (
    <>
      <PageTitle
        eyebrow="NEXORA STUDIO / IDENTIDAD"
        title="Nexora Studio"
        description="Tu restaurante tiene personalidad. Tu espacio de trabajo también."
        action={
          <span className="pill violet">
            <Sparkles size={14} />
            Identidad visual
          </span>
        }
      />
      <section className="studio-surfaces" aria-label="Áreas personalizables">
        <Link to="/admin/studio/pos">
          <strong>Terminal POS</strong>
          <small>Diseño guardado y publicación</small>
        </Link>
        <Link to="/admin/studio/mesas">
          <strong>Mesas y salones</strong>
          <small>Tarjetas operativas y Mesas Compactas</small>
        </Link>
        <Link to="/admin/studio/cocina">
          <strong>Nexora Kitchen</strong>
          <small>Tablero real, tarjetas y colores por estado</small>
        </Link>
        <Link to="/admin/studio/recogidas">
          <strong>Pedidos para llevar</strong>
          <small>Toma de pedidos sin mesa, con diseño independiente</small>
        </Link>
        <Link to="/admin/studio/domicilios">
          <strong>Domicilios</strong>
          <small>Tablero de reparto y toma de pedidos</small>
        </Link>
        {['Dashboard administrativo', 'Recibos y comandas'].map((name) => (
          <div key={name}>
            <strong>{name}</strong>
            <small>Próxima superficie · aún no editable</small>
          </div>
        ))}
      </section>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && <ThemeEditor key={query.data.settings.revision} data={query.data} />
      )}
    </>
  )
}

function ThemeEditor({ data }: { data: StudioData }) {
  const [theme, setTheme] = useState<Theme>({ ...data.settings.theme })
  const [sourceVersion, setSourceVersion] = useState<number | null>(null)
  const { session } = useSession()
  const can = useCan()
  const client = useQueryClient()
  const toast = useToast()
  const changed = JSON.stringify(theme) !== JSON.stringify(data.settings.theme)
  const mutation = useMutation({
    mutationFn: () =>
      api<Settings>('workspace/theme', {
        method: 'PUT',
        body: { revision: data.settings.revision, theme },
      }),
    onSuccess: async () => {
      await Promise.all(
        ['session', 'studio', 'overview'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      toast('Tu nueva identidad está publicada.')
      setSourceVersion(null)
    },
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate()
  }
  const update = <K extends keyof Theme>(key: K, value: Theme[K]) => {
    setTheme((current) => ({ ...current, [key]: value }))
    setSourceVersion(null)
  }
  return (
    <>
      <div className="studio-status">
        <span className="pill green">
          <Check size={13} />
          Versión {data.settings.revision} publicada
        </span>
        <span className="muted">
          {changed
            ? sourceVersion
              ? `Restaurando versión ${sourceVersion}. Publica para aplicar.`
              : 'Tienes cambios sin publicar'
            : 'Tu identidad está al día'}
        </span>
      </div>
      <div className="studio-layout">
        <form className="panel studio-controls form-stack" onSubmit={submit}>
          <div className="panel-heading">
            <h2>
              <Paintbrush size={18} />
              Tu identidad
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Restaurar colores Nexora"
              onClick={() => {
                setTheme({ ...data.defaults })
                setSourceVersion(null)
              }}
              disabled={!can('studio.manage')}
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <p className="muted">Explora los cambios en la vista previa antes de publicarlos.</p>
          <ErrorNotice error={mutation.error} />
          <fieldset disabled={!can('studio.manage')} className="studio-fields">
            <legend className="sr-only">Apariencia del espacio</legend>
            <Field label="Color principal">
              <div className="color-field">
                <input
                  type="color"
                  aria-label="Selector de color principal"
                  value={theme.primary}
                  onChange={(event) => update('primary', event.target.value)}
                />
                <input
                  aria-label="Código del color principal"
                  value={theme.primary}
                  pattern="#[0-9A-Fa-f]{6}"
                  required
                  maxLength={7}
                  onChange={(event) => update('primary', event.target.value)}
                />
              </div>
            </Field>
            <Field label="Color secundario">
              <div className="color-field">
                <input
                  type="color"
                  aria-label="Selector de color secundario"
                  value={theme.secondary}
                  onChange={(event) => update('secondary', event.target.value)}
                />
                <input
                  aria-label="Código del color secundario"
                  value={theme.secondary}
                  pattern="#[0-9A-Fa-f]{6}"
                  required
                  maxLength={7}
                  onChange={(event) => update('secondary', event.target.value)}
                />
              </div>
            </Field>
            <div className="field">
              <span className="field-label">Apariencia</span>
              <div className="segmented" role="group" aria-label="Apariencia">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={theme.mode === mode ? 'selected' : ''}
                    aria-pressed={theme.mode === mode}
                    onClick={() => update('mode', mode)}
                  >
                    {mode === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                    {mode === 'light' ? 'Claro' : 'Oscuro'}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Estilo de bordes">
              <select
                value={theme.radius}
                onChange={(event) => update('radius', event.target.value as Theme['radius'])}
              >
                <option value="rounded">Redondeados</option>
                <option value="soft">Suaves</option>
              </select>
            </Field>
          </fieldset>
          <div className="studio-save">
            <span>
              <ShieldText />
            </span>
            <Submit pending={mutation.isPending} disabled={!changed || !can('studio.manage')}>
              Publicar identidad
            </Submit>
          </div>
        </form>
        <section className="studio-preview">
          <div className="preview-toolbar">
            <span>
              <span className="preview-dot" />
              <span className="preview-dot" />
              <span className="preview-dot" />
            </span>
            <span>
              <Monitor size={15} />
              Vista previa
            </span>
            <span>Escritorio</span>
          </div>
          <div
            className={`preview-canvas ${theme.mode}`}
            style={
              {
                '--preview-primary': /^#[a-fA-F0-9]{6}$/.test(theme.primary)
                  ? theme.primary
                  : data.defaults.primary,
                '--preview-secondary': /^#[a-fA-F0-9]{6}$/.test(theme.secondary)
                  ? theme.secondary
                  : data.defaults.secondary,
                '--preview-on-primary': foreground(theme.primary),
                '--preview-radius': theme.radius === 'rounded' ? '14px' : '6px',
              } as React.CSSProperties
            }
          >
            <div className="preview-sidebar">
              <span className="preview-logo">
                N<span> / </span>
              </span>
              <LayoutDashboard size={19} />
              <UtensilsCrossed size={19} />
              <Paintbrush size={19} />
            </div>
            <div className="preview-main">
              <div className="preview-header">
                <span>{session!.company.name}</span>
                <span className="preview-avatar">{session!.user.name[0]}</span>
              </div>
              <small>UN ESPACIO MUY TUYO</small>
              <h2>Bienvenido a tu restaurante.</h2>
              <p>Todo lo que necesitas, con tu propia identidad.</p>
              <div className="preview-hero">
                <Sparkles size={27} />
                <h3>
                  El próximo capítulo
                  <br />
                  lo escribes tú.
                </h3>
                <span>Tu negocio. Tu personalidad.</span>
                <button type="button" tabIndex={-1}>
                  Tu marca, presente <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="preview-mini-cards">
                <div>
                  <span className="preview-line" />
                  <span className="preview-line short" />
                  <span className="preview-chart" />
                </div>
                <div>
                  <span className="preview-line" />
                  <span className="preview-line short" />
                  <div className="preview-color-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="preview-disclaimer">
            Vista previa del estilo. Los elementos ilustran tu identidad visual.
          </p>
        </section>
      </div>
      <section className="panel version-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TU ESTILO EVOLUCIONA</p>
            <h2>
              <History size={18} />
              Historial de publicaciones
            </h2>
          </div>
          <span className="muted">Últimas 20 versiones</span>
        </div>
        <div className="version-list">
          {data.versions.map((version) => (
            <div className="version-row" key={version.id}>
              <span className="version-swatches">
                <i style={{ background: version.theme.primary }} />
                <i style={{ background: version.theme.secondary }} />
              </span>
              <div>
                <strong>Versión {version.version}</strong>
                <small>
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: session!.company.timezone,
                  }).format(new Date(version.created_at))}
                </small>
              </div>
              {version.version === data.settings.revision ? (
                <span className="pill green">Publicada</span>
              ) : (
                can('studio.manage') && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setTheme({ ...version.theme })
                      setSourceVersion(version.version)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    <RotateCcw size={14} />
                    Restaurar en vista previa
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
function ShieldText() {
  return <>Los cambios se aplican a tu empresa.</>
}
