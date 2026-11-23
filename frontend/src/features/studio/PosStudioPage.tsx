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
import './studio-layout.css'

export type SavedPosLayout = {
  id: number
  revision: number
  draft: unknown
  published: unknown
  published_revision: number | null
}
type StudioPosData = { data: SavedPosLayout | null; defaults: unknown; components: string[] }
export function PosStudioPage() {
  const query = useQuery({
    queryKey: ['studio-pos-editor'],
    queryFn: () => api<StudioPosData>('studio/pos'),
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
      {query.isPending ? <Loading /> : query.data && <PosLayoutEditor data={query.data} />}
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
function PosLayoutEditor({ data }: { data: StudioPosData }) {
  const [config, setConfig] = useState<PosLayout>(
    () =>
      parsePosLayout(data.data?.draft) ?? parsePosLayout(data.defaults) ?? defaultPosConfiguration,
  )
  const [baseline, setBaseline] = useState(JSON.stringify(config))
  const [revision, setRevision] = useState(data.data?.revision ?? 0)
  const [published, setPublished] = useState(data.data?.published_revision ?? 0)
  const [selected, setSelected] = useState<PosPanel>('order')
  const [dragging, setDragging] = useState<PosPanel | null>(null)
  const [reloadError, setReloadError] = useState<unknown>(null)
  const client = useQueryClient()
  const can = useCan()
  const toast = useToast()
  const dirty = JSON.stringify(config) !== baseline
  const save = useOperation<SavedPosLayout>('studio/pos/draft', (result) => {
    const saved = parsePosLayout(result.draft) ?? defaultPosConfiguration
    setConfig(saved)
    setBaseline(JSON.stringify(saved))
    setRevision(result.revision)
    setPublished(result.published_revision ?? 0)
    toast('Borrador guardado. La terminal todavía no cambia.')
  })
  const publish = useOperation<SavedPosLayout>('studio/pos/publish', (result) => {
    const saved = parsePosLayout(result.draft) ?? defaultPosConfiguration
    setConfig(saved)
    setBaseline(JSON.stringify(saved))
    setRevision(result.revision)
    setPublished(result.published_revision ?? 0)
    void client.invalidateQueries({ queryKey: ['studio-pos-active'] })
    toast('Diseño publicado para Terminal POS.')
  })
  const locked = save.locked || publish.locked
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
  async function reload() {
    if (
      locked ||
      (dirty && !window.confirm('¿Descartar tus cambios locales y cargar el borrador guardado?'))
    )
      return
    setReloadError(null)
    try {
      const fresh = await api<StudioPosData>('studio/pos')
      const next = parsePosLayout(fresh.data?.draft) ?? defaultPosConfiguration
      setConfig(next)
      setBaseline(JSON.stringify(next))
      setRevision(fresh.data?.revision ?? 0)
      setPublished(fresh.data?.published_revision ?? 0)
      save.reset()
      publish.reset()
    } catch (error) {
      setReloadError(error)
    }
  }
  return (
    <section className="studio-pos-editor" aria-label="Editor de Terminal POS">
      <header className="studio-editor-toolbar">
        <strong>
          {dirty ? 'Cambios locales' : revision ? `Borrador · revisión ${revision}` : 'Diseño base'}{' '}
          · Publicado {published || 'Original'}
        </strong>
        <button
          className="button secondary"
          disabled={locked || !can('studio.edit')}
          onClick={() => setConfig(structuredClone(defaultPosConfiguration))}
        >
          Restaurar diseño base
        </button>
        <button
          className="button secondary"
          disabled={
            save.isPending ||
            publish.locked ||
            !can('studio.edit') ||
            (!save.uncertain && !dirty && revision > 0)
          }
          onClick={() => save.send({ revision, configuration: config })}
        >
          {save.uncertain ? 'Reintentar guardado' : 'Guardar borrador'}
        </button>
        <button
          className="button primary"
          disabled={
            publish.isPending ||
            save.locked ||
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
          {config.panels.map((id, index) => (
            <div
              key={id}
              draggable={!locked && can('studio.edit')}
              onDragStart={() => setDragging(id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (!dragging || locked || !can('studio.edit')) return
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
                      locked ||
                      !can('studio.edit') ||
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
          <small>Plantillas y asignación por rol/dispositivo: STUDIO-D.</small>
        </aside>
        {can('catalog.view') && can('orders.manage') ? (
          <PosLayoutCanvas
            config={config}
            selected={selected}
            onSelect={setSelected}
            onChange={setConfig}
            editable={!locked && can('studio.edit')}
          />
        ) : (
          <p className="notice">
            La vista previa requiere permisos de catálogo y toma de pedidos. Puedes editar el diseño
            con tus permisos de Studio.
          </p>
        )}
        <fieldset disabled={locked || !can('studio.edit')} className="studio-pos-properties panel">
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
                  value={config.tokens[key as keyof typeof tokenBounds]}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      tokens: { ...config.tokens, [key]: Number(event.target.value) },
                    })
                  }
                />
                <output>{config.tokens[key as keyof typeof tokenBounds]}</output>
              </Field>
            ),
          )}
          <Field label="Color de acento">
            <input
              type="color"
              aria-label="Color de acento"
              value={config.tokens.accent}
              onChange={(event) =>
                setConfig({ ...config, tokens: { ...config.tokens, accent: event.target.value } })
              }
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={config.options.photos}
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
              checked={config.options.hints}
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
