import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioPreviewFrame, type PreviewBox } from './StudioPreviewFrame'
import type { OrderChannel } from '../catalog/context-price-types'
import type { LayoutScope } from './layout-scope'
import { posComponents, type PosLayout, type PosPanel } from './pos-layout'

const viewports = {
  desktop: { width: 1280, height: 740 },
  tablet: { width: 960, height: 800 },
  mobile: { width: 390, height: 844 },
} as const
export function PosLayoutCanvas({
  config,
  channel = 'dine_in',
  device = 'adaptive',
  selected,
  onSelect,
  onChange,
  editable,
}: {
  config: PosLayout
  channel?: OrderChannel
  device?: LayoutScope['device']
  selected: PosPanel
  onSelect: (panel: PosPanel) => void
  onChange: (config: PosLayout) => void
  editable: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>(
    device === 'adaptive' ? 'desktop' : device,
  )
  const [panel, setPanel] = useState<'menu' | 'cart'>('menu')
  const viewport = viewports[previewDevice]
  const measureBoxes = useCallback(
    (next: PreviewBox[]) =>
      setBoxes((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next)),
    [],
  )
  const [scale, setScale] = useState(0.5)
  const [boxes, setBoxes] = useState<PreviewBox[]>([])
  const drag = useRef<{ id: PosPanel; x: number; y: number } | null>(null)
  const resize = useRef<{ x: number; width: number } | null>(null)
  useEffect(() => {
    const root = host.current!
    const measure = () =>
      setScale(Math.min(1, Math.max(0.2, (root.clientWidth - 24) / viewport.width)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [viewport.width])
  function reorder(target: PosPanel, source: PosPanel | null) {
    if (!editable || previewDevice !== 'desktop' || !source || target === source) return
    const panels = config.panels.filter((id) => id !== source)
    panels.splice(config.panels.indexOf(target), 0, source)
    onChange({ ...config, panels })
  }
  return (
    <section className="studio-canvas-host" ref={host} aria-label="Vista previa real de Terminal">
      <header>
        <strong>Terminal POS · componentes reales</strong>
        <span>
          {viewport.width} × {viewport.height} · {Math.round(scale * 100)}%
        </span>
        <label>
          Dispositivo de vista previa
          <select
            aria-label="Dispositivo de vista previa"
            value={previewDevice}
            onChange={(event) => setPreviewDevice(event.target.value as typeof previewDevice)}
          >
            <option value="desktop">Escritorio</option>
            <option value="tablet">Tablet</option>
            <option value="mobile">Móvil</option>
          </select>
        </label>
        {previewDevice === 'mobile' && (
          <label>
            Panel de vista previa
            <select
              aria-label="Panel de vista previa"
              value={panel}
              onChange={(event) => setPanel(event.target.value as typeof panel)}
            >
              <option value="menu">Productos</option>
              <option value="cart">Pedido</option>
            </select>
          </label>
        )}
      </header>
      <div className="studio-canvas-space" style={{ height: viewport.height * scale }}>
        <div
          className="studio-canvas"
          style={{ width: viewport.width, height: viewport.height, transform: `scale(${scale})` }}
        >
          <StudioPreviewFrame
            channel={channel}
            config={config}
            panel={panel}
            width={viewport.width}
            height={viewport.height}
            onMeasure={measureBoxes}
          />
          {boxes.map((box) => (
            <div
              key={box.id}
              className="studio-selection"
              data-selected={selected === box.id}
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            >
              <button
                type="button"
                className="studio-panel-target"
                aria-label={`Seleccionar ${posComponents[box.id].name}`}
                aria-pressed={selected === box.id}
                data-panel={box.id}
                onClick={() => onSelect(box.id)}
                onPointerDown={(event) => {
                  if (!editable || previewDevice !== 'desktop' || event.button !== 0) return
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drag.current = { id: box.id, x: event.clientX, y: event.clientY }
                }}
                onPointerUp={(event) => {
                  const source = drag.current
                  drag.current = null
                  if (!source) return
                  if (Math.hypot(event.clientX - source.x, event.clientY - source.y) < 6) {
                    onSelect(source.id)
                    return
                  }
                  const target = Array.from(
                    host.current?.querySelectorAll<HTMLElement>('.studio-panel-target') ?? [],
                  ).find((node) => {
                    const rect = node.getBoundingClientRect()
                    return (
                      event.clientX >= rect.left &&
                      event.clientX <= rect.right &&
                      event.clientY >= rect.top &&
                      event.clientY <= rect.bottom
                    )
                  })?.dataset.panel
                  if (target && Object.hasOwn(posComponents, target))
                    reorder(target as PosPanel, source.id)
                }}
                onPointerCancel={() => {
                  drag.current = null
                }}
                style={{
                  touchAction: editable && previewDevice === 'desktop' ? 'none' : undefined,
                }}
              >
                <span>{posComponents[box.id].name}</span>
              </button>
              {selected === box.id &&
                box.id === 'order' &&
                editable &&
                previewDevice === 'desktop' && (
                  <button
                    type="button"
                    className="studio-resize"
                    aria-label="Redimensionar panel del pedido"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      resize.current = { x: event.clientX, width: config.tokens.order_width }
                    }}
                    onPointerMove={(event) => {
                      if (!resize.current) return
                      const width = Math.round(
                        Math.max(
                          320,
                          Math.min(
                            560,
                            resize.current.width + (event.clientX - resize.current.x) / scale,
                          ),
                        ),
                      )
                      onChange({ ...config, tokens: { ...config.tokens, order_width: width } })
                    }}
                    onPointerUp={() => {
                      resize.current = null
                    }}
                    onPointerCancel={() => {
                      resize.current = null
                    }}
                  >
                    ↔
                  </button>
                )}
            </div>
          ))}
        </div>
      </div>
      <p>
        El dispositivo de vista previa no cambia la asignación del diseño. En móvil puedes revisar
        Productos y Pedido. Las acciones operativas permanecen deshabilitadas.
      </p>
    </section>
  )
}
