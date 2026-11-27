import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, PageTitle, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { defaultLayoutScope } from './layout-scope'
import { useLayoutHistory } from './useLayoutHistory'
import { StudioPreviewFrame } from './StudioPreviewFrame'
import { StudioVersions, StudioVersionAction, type VersionAction } from './StudioVersions'
import type { SavedPosLayout } from './PosStudioPage'
import {
  compactTablesLayout,
  defaultTablesLayout,
  parseTablesLayout,
  tableBounds,
  type TablesLayout,
} from './tables-layout'
import './studio-layout.css'
import './tables-layout.css'

const TerminalTablesPage = lazy(() =>
  import('../dining/TerminalTablesPage').then((module) => ({ default: module.TerminalTablesPage })),
)

type StudioData = { data: SavedPosLayout | null; defaults: unknown }
export function TablesStudioPage() {
  const query = useQuery({
    queryKey: ['studio-tables-editor'],
    queryFn: () => api<StudioData>('studio/tables'),
    refetchOnWindowFocus: false,
  })
  return (
    <>
      <PageTitle
        eyebrow="NEXORA STUDIO / MESAS"
        title="Diseña Mesas y salones"
        description="Diseño general de tarjetas operativas. El plano físico y la ocupación conservan sus datos y permisos."
        action={<Link to="/studio">Volver a Studio</Link>}
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? <Loading /> : query.data && <TablesEditor data={query.data} />}
    </>
  )
}

const labels = {
  card_width: 'Ancho de mesa',
  card_height: 'Alto de mesa',
  gap: 'Espacio entre mesas',
  radius: 'Esquinas',
  font_size: 'Tamaño del nombre',
}
function TablesEditor({ data }: { data: StudioData }) {
  const can = useCan()
  const toast = useToast()
  const client = useQueryClient()
  const history = useLayoutHistory(parseTablesLayout(data.data?.draft) ?? defaultTablesLayout)
  const { config, set: setConfig } = history
  const [baseline, setBaseline] = useState(JSON.stringify(config))
  const [revision, setRevision] = useState(data.data?.revision ?? 0)
  const [published, setPublished] = useState(data.data?.published_revision ?? 0)
  const [publishedConfig, setPublishedConfig] = useState(
    parseTablesLayout(data.data?.published) ?? defaultTablesLayout,
  )
  const [preview, setPreview] = useState<TablesLayout | null>(null)
  const [action, setAction] = useState<VersionAction | null>(null)
  const [reloading, setReloading] = useState(false)
  const [reloadError, setReloadError] = useState<unknown>(null)
  function accepted(result: SavedPosLayout, publish = false) {
    const next = parseTablesLayout(result.draft) ?? defaultTablesLayout
    history.reset(next)
    setBaseline(JSON.stringify(next))
    setRevision(result.revision)
    setPublished(result.published_revision ?? 0)
    setPublishedConfig(parseTablesLayout(result.published) ?? defaultTablesLayout)
    setPreview(null)
    if (publish) void client.invalidateQueries({ queryKey: ['studio-tables-active'] })
  }
  const save = useOperation<SavedPosLayout>('studio/tables/draft', (result) => {
    accepted(result)
    toast('Borrador guardado. Mesas todavía no cambia.')
  })
  const publish = useOperation<SavedPosLayout>('studio/tables/publish', (result) => {
    accepted(result, true)
    toast('Diseño de Mesas publicado.')
  })
  const dirty = JSON.stringify(config) !== baseline
  const locked = save.locked || publish.locked || !!action || reloading
  const readOnly = locked || !!preview || !can('studio.edit')
  useEffect(() => {
    if (!dirty && !locked) return
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const link = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (anchor && (locked || !window.confirm('¿Salir sin guardar los cambios locales?'))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', link, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', link, true)
    }
  }, [dirty, locked])
  async function reload() {
    if (
      locked ||
      (dirty && !window.confirm('¿Descartar los cambios locales y cargar el borrador guardado?'))
    )
      return
    setReloading(true)
    setReloadError(null)
    try {
      const fresh = await api<StudioData>('studio/tables')
      if (fresh.data) accepted(fresh.data)
      else {
        history.reset(defaultTablesLayout)
        setBaseline(JSON.stringify(defaultTablesLayout))
        setRevision(0)
        setPublished(0)
        setPublishedConfig(defaultTablesLayout)
      }
      save.reset()
      publish.reset()
    } catch (error) {
      setReloadError(error)
    } finally {
      setReloading(false)
    }
  }
  const displayed = preview ?? config
  return (
    <section
      aria-label="Editor de Mesas"
      className="studio-pos-editor"
      onPointerDownCapture={(event) => {
        if (event.target instanceof Element && event.target.matches('input[type="range"]'))
          history.begin()
      }}
      onPointerUpCapture={history.end}
      onPointerCancelCapture={history.end}
    >
      <header className="studio-editor-toolbar">
        <strong>
          {dirty ? 'Cambios locales' : `Borrador ${revision}`} · Publicado {published || 'Original'}
        </strong>
        <button disabled={readOnly || !history.canUndo} onClick={history.undo}>
          Deshacer
        </button>
        <button disabled={readOnly || !history.canRedo} onClick={history.redo}>
          Rehacer
        </button>
        <button disabled={locked} onClick={() => setPreview(preview ? null : publishedConfig)}>
          {preview ? 'Volver al borrador' : 'Ver publicado'}
        </button>
        <button
          disabled={
            save.isPending ||
            reloading ||
            !!action ||
            !!preview ||
            publish.locked ||
            !can('studio.edit') ||
            (!save.uncertain && !dirty && revision > 0)
          }
          onClick={() => save.send({ revision, configuration: config })}
        >
          {save.uncertain ? 'Reintentar guardado' : 'Guardar borrador'}
        </button>
        <button
          disabled={
            publish.isPending ||
            save.locked ||
            !!action ||
            reloading ||
            !!preview ||
            !can('studio.publish') ||
            (!publish.uncertain && (dirty || !revision))
          }
          onClick={() => publish.send({ revision })}
        >
          {publish.uncertain ? 'Reintentar publicación' : 'Publicar diseño'}
        </button>
      </header>
      <ErrorNotice error={save.error || publish.error || reloadError} />
      <OperationNotice uncertain={save.uncertain || publish.uncertain} />
      <button disabled={locked} onClick={() => void reload()}>
        Recargar borrador guardado
      </button>
      {preview && <p className="notice">Vista previa de solo lectura. Tu borrador se conserva.</p>}
      <fieldset disabled={readOnly} className="panel form-actions">
        <legend>Plantillas de Mesas</legend>
        {[
          ['Original', defaultTablesLayout],
          ['Mesas Compactas', compactTablesLayout],
        ].map(([name, value]) => (
          <button
            key={String(name)}
            onClick={() => {
              if (
                !dirty ||
                window.confirm('¿Aplicar esta plantilla al borrador local? Puedes deshacerlo.')
              )
                setConfig(structuredClone(value as TablesLayout))
            }}
          >
            {String(name)}
          </button>
        ))}
      </fieldset>
      <div className="studio-tables-workspace">
        <fieldset disabled={readOnly} className="panel studio-pos-properties">
          <legend>Tarjetas de mesas</legend>
          {Object.entries(tableBounds).map(([key, [min, max]]) => (
            <Field key={key} label={labels[key as keyof typeof labels]}>
              <input
                type="range"
                aria-label={labels[key as keyof typeof labels]}
                min={min}
                max={max}
                value={displayed.tokens[key as keyof typeof tableBounds]}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    tokens: { ...config.tokens, [key]: Number(event.target.value) },
                  })
                }
              />
              <output>{displayed.tokens[key as keyof typeof tableBounds]}</output>
            </Field>
          ))}
          {(
            [
              ['available', 'Color libre'],
              ['occupied', 'Color ocupada'],
              ['paid', 'Color pagada y ocupada'],
            ] as const
          ).map(([key, name]) => (
            <Field key={key} label={name}>
              <input
                type="color"
                aria-label={name}
                value={displayed.tokens[key]}
                onChange={(event) =>
                  setConfig({ ...config, tokens: { ...config.tokens, [key]: event.target.value } })
                }
              />
            </Field>
          ))}
          {(
            [
              ['capacity', 'Mostrar personas / capacidad'],
              ['symbol', 'Mostrar símbolo de mesa'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={displayed.options[key]}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    options: { ...config.options, [key]: event.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
          <p>El nombre y el estado real siempre permanecen visibles.</p>
        </fieldset>
        {can('dining.view') ? (
          <TablesPreview config={displayed} />
        ) : (
          <p>La vista previa requiere permiso para consultar mesas.</p>
        )}
      </div>
      <StudioVersions
        surface="tables"
        scope={defaultLayoutScope}
        revision={revision}
        locked={locked}
        editable={!dirty && can('studio.edit')}
        onPreview={(version) => {
          const parsed = parseTablesLayout(version.configuration)
          if (parsed) setPreview(parsed)
          else toast('Versión no compatible.')
        }}
        onAction={setAction}
      />
      {action && (
        <StudioVersionAction
          surface="tables"
          scope={defaultLayoutScope}
          value={action}
          onClose={() => setAction(null)}
          onSaved={(result) => {
            accepted(result)
            setAction(null)
          }}
          onStale={() => setAction(null)}
        />
      )}
    </section>
  )
}

const noop = () => {}
function TablesPreview({ config }: { config: TablesLayout }) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1280)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const node = host.current!
    const measure = () => setScale(Math.min(1, Math.max(0.2, (node.clientWidth - 20) / width)))
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [width])
  return (
    <div ref={host} className="studio-tables-preview" aria-label="Vista previa real de Mesas">
      <label>
        Dispositivo de vista previa
        <select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
          <option value={1280}>Escritorio</option>
          <option value={960}>Tablet</option>
          <option value={390}>Móvil</option>
        </select>
      </label>
      <div style={{ height: 740 * scale, position: 'relative' }}>
        <div
          style={{ width, height: 740, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <StudioPreviewFrame
            width={width}
            height={740}
            onMeasure={noop}
            content={
              <div className="studio-tables-preview">
                <Suspense fallback={<Loading />}>
                  <TerminalTablesPage studioPreview={config} />
                </Suspense>
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}
