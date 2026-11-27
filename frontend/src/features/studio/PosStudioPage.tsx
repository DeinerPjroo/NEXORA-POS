import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Loading, PageTitle, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import {
  defaultPosConfiguration,
  parsePosLayout,
  tokenBounds,
  posComponents,
  type PosPanel,
  type PosLayout,
} from './pos-layout'
import { PosLayoutCanvas } from './PosLayoutCanvas'
import { useLayoutHistory } from './useLayoutHistory'
import { posTemplates } from './pos-templates'
import { StudioTemplates } from './StudioTemplates'
import { defaultLayoutScope, scopeQuery, type LayoutScope } from './layout-scope'
import {
  StudioVersions,
  StudioVersionAction,
  type VersionAction,
  type LayoutVersion,
} from './StudioVersions'
import './studio-layout.css'

export type SavedPosLayout = {
  id: number
  revision: number
  draft: unknown
  published: unknown
  published_revision: number | null
  draft_revision: number | null
}
type StudioPosData = {
  data: SavedPosLayout | null
  defaults: unknown
  components: string[]
  roles: { id: number; name: string }[]
}
export function PosStudioPage() {
  const [scope, setScope] = useState<LayoutScope>(defaultLayoutScope)
  const [scopeBlocked, setScopeBlocked] = useState(false)
  const query = useQuery({
    queryKey: ['studio-pos-editor', scope],
    queryFn: () => api<StudioPosData>(`studio/pos?${scopeQuery(scope)}`),
    refetchOnWindowFocus: false,
  })
  return (
    <>
      <PageTitle
        eyebrow="NEXORA STUDIO / TERMINAL"
        title="Diseña tu terminal"
        description="Configuración visual segura. Los operadores reciben únicamente el diseño publicado."
        action={<Link to="/studio">Volver a Studio</Link>}
      />
      <ErrorNotice error={query.error} />
      <fieldset disabled={scopeBlocked || query.isFetching} className="panel form-actions">
        <Field label="Dispositivo">
          <select
            value={scope.device}
            onChange={(e) =>
              setScope({ ...scope, device: e.target.value as LayoutScope['device'] })
            }
          >
            <option value="adaptive">Todos los dispositivos</option>
            <option value="desktop">Escritorio</option>
            <option value="tablet">Tablet</option>
            <option value="mobile">Móvil</option>
          </select>
        </Field>
        <Field label="Rol operativo">
          <select
            value={scope.role_id ?? ''}
            onChange={(e) =>
              setScope({ ...scope, role_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Todos los roles</option>
            {query.data?.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        <small>Guarda o descarta los cambios antes de cambiar la asignación.</small>
      </fieldset>
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <PosLayoutEditor
            key={scopeQuery(scope)}
            data={query.data}
            scope={scope}
            onBlocked={setScopeBlocked}
          />
        )
      )}
    </>
  )
}
const labels = {
  order_width: 'Ancho del pedido',
  category_width: 'Ancho de categorías',
  product_columns: 'Columnas de productos',
  card_height: 'Alto de producto',
  gap: 'Espacio entre paneles',
  radius: 'Radio de esquinas',
  font_size: 'Tamaño de texto',
}
function PosLayoutEditor({
  data,
  scope,
  onBlocked,
}: {
  data: StudioPosData
  scope: LayoutScope
  onBlocked: (blocked: boolean) => void
}) {
  const history = useLayoutHistory(
    parsePosLayout(data.data?.draft) ?? parsePosLayout(data.defaults) ?? defaultPosConfiguration,
  )
  const { config, set: setConfig } = history
  const [publishedConfig, setPublishedConfig] = useState(
    parsePosLayout(data.data?.published) ?? defaultPosConfiguration,
  )
  const [previewVersion, setPreviewVersion] = useState<{
    revision: number
    config: PosLayout
  } | null>(null)
  const [viewPublished, setViewPublished] = useState(false)
  const [versionAction, setVersionAction] = useState<VersionAction | null>(null)
  const [baseline, setBaseline] = useState(JSON.stringify(config))
  const [revision, setRevision] = useState(data.data?.revision ?? 0)
  const [published, setPublished] = useState(data.data?.published_revision ?? 0)
  const [selected, setSelected] = useState<PosPanel>('order')
  const [dragging, setDragging] = useState<PosPanel | null>(null)
  const [reloadError, setReloadError] = useState<unknown>(null)
  const [reloading, setReloading] = useState(false)
  const [templateBusy, setTemplateBusy] = useState(false)
  const client = useQueryClient()
  const can = useCan()
  const toast = useToast()
  const dirty = JSON.stringify(config) !== baseline
  const scopedDefault = parsePosLayout(data.defaults) ?? defaultPosConfiguration
  function applyTemplate(configuration: PosLayout) {
    const next = structuredClone(configuration)
    if (scope.device === 'mobile' || scope.device === 'tablet') next.tokens.product_columns = 2
    if (scope.device === 'mobile') next.panels = [...defaultPosConfiguration.panels]
    setConfig(next)
  }
  const save = useOperation<SavedPosLayout>('studio/pos/draft', (result) => {
    const saved = parsePosLayout(result.draft) ?? defaultPosConfiguration
    setConfig(saved)
    setBaseline(JSON.stringify(saved))
    setRevision(result.revision)
    setPublished(result.published_revision ?? 0)
    setPublishedConfig(parsePosLayout(result.published) ?? defaultPosConfiguration)
    toast('Borrador guardado. La terminal todavía no cambia.')
  })
  const publish = useOperation<SavedPosLayout>('studio/pos/publish', (result) => {
    const saved = parsePosLayout(result.draft) ?? defaultPosConfiguration
    history.reset(saved)
    setBaseline(JSON.stringify(saved))
    setRevision(result.revision)
    setPublished(result.published_revision ?? 0)
    setPublishedConfig(parsePosLayout(result.published) ?? defaultPosConfiguration)
    void client.invalidateQueries({ queryKey: ['studio-pos-active'] })
    toast('Diseño publicado para Terminal POS.')
  })
  const locked = save.locked || publish.locked || !!versionAction || reloading || templateBusy
  useEffect(() => {
    onBlocked(dirty || locked)
    return () => onBlocked(false)
  }, [dirty, locked, onBlocked])
  const inspecting = viewPublished || !!previewVersion
  const editLocked = locked || inspecting
  const previewConfig = previewVersion?.config ?? (viewPublished ? publishedConfig : config)
  const changes = [
    {
      label: 'Tema',
      draft: config.options.theme ?? 'inherit',
      active: publishedConfig.options.theme ?? 'inherit',
    },
    {
      label: 'Orden de paneles',
      draft: config.panels.map((id) => posComponents[id].name).join(' → '),
      active: publishedConfig.panels.map((id) => posComponents[id].name).join(' → '),
    },
    ...Object.keys(config.tokens).map((key) => ({
      label: key === 'accent' ? 'Color de acento' : labels[key as keyof typeof labels],
      draft: String(config.tokens[key as keyof PosLayout['tokens']]),
      active: String(publishedConfig.tokens[key as keyof PosLayout['tokens']]),
    })),
    ...(['photos', 'hints'] as const).map((key) => ({
      label: key === 'photos' ? 'Fotografías' : 'Ayudas de teclado',
      draft: config.options[key] ? 'Sí' : 'No',
      active: publishedConfig.options[key] ? 'Sí' : 'No',
    })),
  ].filter((row) => row.draft !== row.active)
  function preview(version: LayoutVersion) {
    const parsed = parsePosLayout(version.configuration)
    if (!parsed) {
      toast('Esta versión requiere un esquema compatible para previsualizarse.')
      return
    }
    setPreviewVersion({ revision: version.revision, config: parsed })
    setViewPublished(false)
  }
  useEffect(() => {
    if (!dirty && !locked) return
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const link = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!target || target.getAttribute('target') === '_blank') return
      if (locked || !window.confirm('¿Salir del editor sin guardar tus cambios locales?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', prevent)
    document.addEventListener('click', link, true)
    return () => {
      window.removeEventListener('beforeunload', prevent)
      document.removeEventListener('click', link, true)
    }
  }, [dirty, locked])
  async function reload(force = false) {
    if (
      !force &&
      (locked ||
        (dirty && !window.confirm('¿Descartar tus cambios locales y cargar el borrador guardado?')))
    )
      return
    setReloadError(null)
    setReloading(true)
    try {
      const fresh = await api<StudioPosData>(`studio/pos?${scopeQuery(scope)}`)
      const next =
        parsePosLayout(fresh.data?.draft) ??
        parsePosLayout(fresh.defaults) ??
        defaultPosConfiguration
      history.reset(next)
      setBaseline(JSON.stringify(next))
      setRevision(fresh.data?.revision ?? 0)
      setPublished(fresh.data?.published_revision ?? 0)
      setPublishedConfig(parsePosLayout(fresh.data?.published) ?? defaultPosConfiguration)
      setPreviewVersion(null)
      setViewPublished(false)
      save.reset()
      publish.reset()
    } catch (error) {
      setReloadError(error)
    } finally {
      setReloading(false)
    }
  }
  return (
    <section
      className="studio-pos-editor"
      aria-label="Editor de Terminal POS"
      onPointerDownCapture={(event) => {
        if (
          !editLocked &&
          event.target instanceof Element &&
          event.target.closest('input[type="range"], .studio-resize')
        )
          history.begin()
      }}
      onPointerUpCapture={() => history.end()}
      onPointerCancelCapture={() => history.end()}
      onKeyDown={(event) => {
        if (
          editLocked ||
          !can('studio.edit') ||
          !(event.ctrlKey || event.metaKey) ||
          (event.target instanceof Element &&
            event.target.closest('input,textarea,[contenteditable="true"]'))
        )
          return
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault()
          if (event.shiftKey) history.redo()
          else history.undo()
        } else if (event.key.toLowerCase() === 'y') {
          event.preventDefault()
          history.redo()
        }
      }}
    >
      <header className="studio-editor-toolbar">
        <strong>
          {dirty ? 'Cambios locales' : revision ? `Borrador · revisión ${revision}` : 'Diseño base'}{' '}
          · Publicado {published || 'Original'}
        </strong>
        <button
          type="button"
          className="button secondary"
          disabled={editLocked || !can('studio.edit') || !history.canUndo}
          onClick={history.undo}
        >
          Deshacer
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={editLocked || !can('studio.edit') || !history.canRedo}
          onClick={history.redo}
        >
          Rehacer
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={locked}
          onClick={() => {
            setViewPublished(!viewPublished)
            setPreviewVersion(null)
          }}
        >
          {viewPublished ? 'Volver al borrador' : 'Ver diseño publicado'}
        </button>
        <button
          className="button secondary"
          disabled={editLocked || !can('studio.edit')}
          onClick={() => setConfig(structuredClone(scopedDefault))}
        >
          Restaurar diseño base
        </button>
        <button
          className="button secondary"
          disabled={
            save.isPending ||
            inspecting ||
            !!versionAction ||
            publish.locked ||
            !can('studio.edit') ||
            (!save.uncertain && !dirty && revision > 0)
          }
          onClick={() => save.send({ ...scope, revision, configuration: config })}
        >
          {save.uncertain ? 'Reintentar guardado' : 'Guardar borrador'}
        </button>
        <button
          className="button primary"
          disabled={
            publish.isPending ||
            inspecting ||
            !!versionAction ||
            save.locked ||
            !can('studio.publish') ||
            (!publish.uncertain && (dirty || !revision))
          }
          onClick={() => publish.send({ ...scope, revision })}
        >
          {publish.uncertain ? 'Reintentar publicación' : 'Publicar diseño'}
        </button>
      </header>
      <ErrorNotice error={save.error || publish.error || reloadError} />
      <OperationNotice uncertain={save.uncertain || publish.uncertain} />
      <StudioTemplates
        config={config}
        disabled={editLocked}
        onBusy={setTemplateBusy}
        onApply={(next) => {
          if (
            dirty &&
            !window.confirm(
              '¿Reemplazar los cambios locales por esta plantilla? Podrás deshacerlo.',
            )
          )
            return
          applyTemplate(next)
        }}
      />
      <fieldset
        disabled={editLocked || !can('studio.edit')}
        className="panel studio-template-picker"
      >
        <legend>Plantillas de Terminal</legend>
        <p>Aplicar cambia solo el borrador local. Puedes deshacer, guardar y publicar después.</p>
        <div>
          {posTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="button secondary"
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    '¿Reemplazar los cambios locales por esta plantilla? Podrás deshacerlo.',
                  )
                )
                  return
                applyTemplate(template.configuration)
                toast(`Plantilla ${template.name} aplicada al borrador local.`)
              }}
            >
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {inspecting && (
        <p className="notice">
          Vista previa de{' '}
          {previewVersion
            ? `versión ${previewVersion.revision}`
            : published
              ? `publicación ${published}`
              : 'diseño base sin publicación'}
          . Tu borrador se conserva.{' '}
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setPreviewVersion(null)
              setViewPublished(false)
            }}
          >
            Editar borrador
          </button>
        </p>
      )}
      <details className="panel studio-comparison">
        <summary>Comparar borrador con publicado · {changes.length} diferencias</summary>
        {changes.length ? (
          <table>
            <thead>
              <tr>
                <th>Propiedad</th>
                <th>Borrador local</th>
                <th>{published ? `Publicado ${published}` : 'Base original'}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.draft}</td>
                  <td>{row.active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>El borrador coincide con el diseño publicado o base.</p>
        )}
      </details>
      {((save.error instanceof ApiError && save.error.status === 409) ||
        (publish.error instanceof ApiError && publish.error.status === 409)) && (
        <button disabled={locked} onClick={() => void reload()}>
          Recargar borrador guardado
        </button>
      )}
      <div className="studio-visual-workspace">
        <aside className="studio-component-tree panel" aria-label="Estructura de Terminal">
          <h2>Componentes</h2>
          <p>Arrastra para reordenar o usa las flechas.</p>
          {previewConfig.panels.map((id, index) => (
            <div
              key={id}
              draggable={!editLocked && can('studio.edit') && scope.device !== 'mobile'}
              onDragStart={() => setDragging(id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (!dragging || editLocked || !can('studio.edit') || scope.device === 'mobile')
                  return
                const panels = config.panels.filter((item) => item !== dragging)
                panels.splice(index, 0, dragging)
                setConfig({ ...config, panels })
                setDragging(null)
              }}
            >
              <button type="button" aria-pressed={selected === id} onClick={() => setSelected(id)}>
                {index + 1}. {posComponents[id].name}
              </button>
              <div>
                {([-1, 1] as const).map((step) => (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${step === -1 ? 'Mover antes' : 'Mover después'} ${posComponents[id].name}`}
                    disabled={
                      editLocked ||
                      !can('studio.edit') ||
                      scope.device === 'mobile' ||
                      index + step < 0 ||
                      index + step >= config.panels.length
                    }
                    onClick={() => {
                      const panels = [...config.panels]
                      ;[panels[index], panels[index + step]] = [panels[index + step], panels[index]]
                      setConfig({ ...config, panels })
                    }}
                  >
                    {step === -1 ? '←' : '→'}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p>Todos los paneles son obligatorios. Fotografías y ayudas son opcionales.</p>
          <small>Tablet y móvil usan dos columnas; móvil conserva el orden operativo.</small>
        </aside>
        {can('catalog.view') && can('orders.manage') ? (
          <PosLayoutCanvas
            config={previewConfig}
            selected={selected}
            onSelect={setSelected}
            onChange={setConfig}
            editable={!editLocked && can('studio.edit') && scope.device !== 'mobile'}
          />
        ) : (
          <p className="notice">
            La vista previa requiere permisos de catálogo y toma de pedidos. Puedes editar el diseño
            con tus permisos de Studio.
          </p>
        )}
        <fieldset
          disabled={editLocked || !can('studio.edit')}
          className="studio-pos-properties panel"
        >
          <legend>{posComponents[selected].name}</legend>
          <p>
            {posComponents[selected].description} Colores, texto, esquinas y espacios son estilos
            compartidos.
          </p>
          {Object.entries(tokenBounds).map(([key, [min, max]]) =>
            (key === 'order_width' && selected !== 'order') ||
            (key === 'category_width' && selected !== 'categories') ||
            (['product_columns', 'card_height'].includes(key) && selected !== 'products') ? null : (
              <Field key={key} label={labels[key as keyof typeof labels]}>
                <input
                  type="range"
                  aria-label={labels[key as keyof typeof labels]}
                  min={min}
                  max={max}
                  disabled={
                    key === 'product_columns' && ['tablet', 'mobile'].includes(scope.device)
                  }
                  value={previewConfig.tokens[key as keyof typeof tokenBounds]}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      tokens: { ...config.tokens, [key]: Number(event.target.value) },
                    })
                  }
                />
                <output>{previewConfig.tokens[key as keyof typeof tokenBounds]}</output>
              </Field>
            ),
          )}
          <Field label="Color de acento">
            <input
              type="color"
              aria-label="Color de acento"
              value={previewConfig.tokens.accent}
              onChange={(event) =>
                setConfig({ ...config, tokens: { ...config.tokens, accent: event.target.value } })
              }
            />
          </Field>
          <Field label="Tema de la terminal">
            <select
              value={previewConfig.options.theme ?? 'inherit'}
              onChange={(event) =>
                setConfig({
                  ...config,
                  schema_version: 2,
                  options: {
                    ...config.options,
                    theme: event.target.value as 'inherit' | 'light' | 'dark',
                  },
                })
              }
            >
              <option value="inherit">Tema de la empresa</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </Field>
          <label>
            <input
              type="checkbox"
              checked={previewConfig.options.photos}
              onChange={(event) =>
                setConfig({
                  ...config,
                  options: { ...config.options, photos: event.target.checked },
                })
              }
            />{' '}
            Fotografías de productos
          </label>
          <label>
            <input
              type="checkbox"
              checked={previewConfig.options.hints}
              onChange={(event) =>
                setConfig({
                  ...config,
                  options: { ...config.options, hints: event.target.checked },
                })
              }
            />{' '}
            Ayudas de teclado
          </label>
        </fieldset>
      </div>
      <StudioVersions
        scope={scope}
        revision={revision}
        locked={locked}
        editable={!dirty && can('studio.edit')}
        onPreview={preview}
        onAction={setVersionAction}
      />
      {dirty && (
        <p className="muted small">
          Guarda tus cambios locales antes de restaurar o archivar versiones.
        </p>
      )}
      {versionAction && (
        <StudioVersionAction
          scope={scope}
          value={versionAction}
          onClose={() => setVersionAction(null)}
          onStale={() => {
            setVersionAction(null)
            void reload(true)
          }}
          onSaved={(result) => {
            setReloadError(null)
            const next = parsePosLayout(result.draft) ?? defaultPosConfiguration
            history.reset(next)
            setBaseline(JSON.stringify(next))
            setRevision(result.revision)
            setPublished(result.published_revision ?? 0)
            setPublishedConfig(parsePosLayout(result.published) ?? defaultPosConfiguration)
            setPreviewVersion(null)
            setViewPublished(false)
            toast(
              versionAction.action === 'restore'
                ? 'Versión restaurada como borrador. Publica para aplicarla.'
                : 'Versión archivada conservando su historial.',
            )
          }}
        />
      )}
      <p className="notice">
        Distribución adaptable: en tablet y móvil se conserva la estructura operativa segura.
        Pedidos, cobros y permisos mantienen sus servicios actuales.
      </p>
      <Link
        to="/pos"
        onClick={(event) => {
          if (locked) event.preventDefault()
        }}
      >
        Abrir Terminal POS
      </Link>
    </section>
  )
}
