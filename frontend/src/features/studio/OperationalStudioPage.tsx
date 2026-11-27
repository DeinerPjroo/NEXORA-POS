import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import './studio-layout.css'
import './tables-layout.css'

export type OperationalConfig = {
  schema_version: number
  tokens: Record<string, number | string>
  options?: Record<string, boolean>
}
export type SurfaceDefinition<T extends OperationalConfig> = {
  surface: 'tables' | 'kitchen'
  title: string
  eyebrow: string
  description: string
  editorName: string
  previewName: string
  propertiesName: string
  permission: string
  help: string
  defaults: T
  parse: (value: unknown) => T | null
  numbers: Record<string, { label: string; min: number; max: number }>
  colors: Record<string, string>
  flags?: Record<string, string>
  presets: { name: string; configuration: T }[]
  render: (config: T) => ReactNode
}

type StudioData = { data: SavedPosLayout | null; defaults: unknown }
export function OperationalStudioPage<T extends OperationalConfig>({
  definition,
}: {
  definition: SurfaceDefinition<T>
}) {
  const query = useQuery({
    queryKey: ['studio-editor', definition.surface],
    queryFn: () => api<StudioData>(`studio/${definition.surface}`),
    refetchOnWindowFocus: false,
  })
  return (
    <>
      <PageTitle
        eyebrow={definition.eyebrow}
        title={definition.title}
        description={definition.description}
        action={<Link to="/studio">Volver a Studio</Link>}
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && <OperationalEditor data={query.data} definition={definition} />
      )}
    </>
  )
}

function OperationalEditor<T extends OperationalConfig>({
  data,
  definition,
}: {
  data: StudioData
  definition: SurfaceDefinition<T>
}) {
  const can = useCan()
  const toast = useToast()
  const client = useQueryClient()
  const history = useLayoutHistory(definition.parse(data.data?.draft) ?? definition.defaults)
  const { config, set: setConfig } = history
  const [baseline, setBaseline] = useState(JSON.stringify(config))
  const [revision, setRevision] = useState(data.data?.revision ?? 0)
  const [published, setPublished] = useState(data.data?.published_revision ?? 0)
  const [publishedConfig, setPublishedConfig] = useState(
    definition.parse(data.data?.published) ?? definition.defaults,
  )
  const [preview, setPreview] = useState<T | null>(null)
  const [action, setAction] = useState<VersionAction | null>(null)
  const [reloading, setReloading] = useState(false)
  const [reloadError, setReloadError] = useState<unknown>(null)
  function accepted(result: SavedPosLayout, publish = false) {
    const next = definition.parse(result.draft) ?? definition.defaults
    history.reset(next)
    setBaseline(JSON.stringify(next))
    setRevision(result.revision)
    setPublished(result.published_revision ?? 0)
    setPublishedConfig(definition.parse(result.published) ?? definition.defaults)
    setPreview(null)
    if (publish)
      void client.invalidateQueries({ queryKey: [`studio-${definition.surface}-active`] })
  }
  const save = useOperation<SavedPosLayout>(`studio/${definition.surface}/draft`, (result) => {
    accepted(result)
    toast('Borrador guardado. La vista operativa todavía no cambia.')
  })
  const publish = useOperation<SavedPosLayout>(`studio/${definition.surface}/publish`, (result) => {
    accepted(result, true)
    toast('Diseño operativo publicado.')
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
      const fresh = await api<StudioData>(`studio/${definition.surface}`)
      if (fresh.data) accepted(fresh.data)
      else {
        history.reset(definition.defaults)
        setBaseline(JSON.stringify(definition.defaults))
        setRevision(0)
        setPublished(0)
        setPublishedConfig(definition.defaults)
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
      aria-label={definition.editorName}
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
        <legend>Plantillas disponibles</legend>
        {definition.presets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => {
              if (
                !dirty ||
                window.confirm('¿Aplicar esta plantilla al borrador local? Puedes deshacerlo.')
              )
                setConfig(structuredClone(preset.configuration))
            }}
          >
            {preset.name}
          </button>
        ))}
      </fieldset>
      <div className="studio-tables-workspace">
        <fieldset disabled={readOnly} className="panel studio-pos-properties">
          <legend>{definition.propertiesName}</legend>
          {Object.entries(definition.numbers).map(([key, { label, min, max }]) => (
            <Field key={key} label={label}>
              <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                value={displayed.tokens[key]}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    tokens: { ...config.tokens, [key]: Number(event.target.value) },
                  })
                }
              />
              <output>{displayed.tokens[key]}</output>
            </Field>
          ))}
          {Object.entries(definition.colors).map(([key, name]) => (
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
          {Object.entries(definition.flags ?? {}).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={displayed.options?.[key] ?? false}
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
          <p>{definition.help}</p>
        </fieldset>
        {can(definition.permission) ? (
          <OperationalPreview config={displayed} definition={definition} />
        ) : (
          <p>La vista previa requiere permiso para consultar esta superficie.</p>
        )}
      </div>
      <StudioVersions
        surface={definition.surface}
        scope={defaultLayoutScope}
        revision={revision}
        locked={locked}
        editable={!dirty && can('studio.edit')}
        onPreview={(version) => {
          const parsed = definition.parse(version.configuration)
          if (parsed) setPreview(parsed)
          else toast('Versión no compatible.')
        }}
        onAction={setAction}
      />
      {action && (
        <StudioVersionAction
          surface={definition.surface}
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
function OperationalPreview<T extends OperationalConfig>({
  config,
  definition,
}: {
  config: T
  definition: SurfaceDefinition<T>
}) {
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
    <div ref={host} className="studio-tables-preview" aria-label={definition.previewName}>
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
            content={<div className="studio-tables-preview">{definition.render(config)}</div>}
          />
        </div>
      </div>
    </div>
  )
}
