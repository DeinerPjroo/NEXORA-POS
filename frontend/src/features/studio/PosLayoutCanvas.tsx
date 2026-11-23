import { useEffect, useRef, useState } from 'react'
import { OrderComposer } from '../orders/OrderComposer'
import { posComponents, type PosLayout, type PosPanel } from './pos-layout'

type Box = { id: PosPanel; left: number; top: number; width: number; height: number }
export function PosLayoutCanvas({
  config,
  selected,
  onSelect,
  onChange,
  editable,
}: {
  config: PosLayout
  selected: PosPanel
  onSelect: (panel: PosPanel) => void
  onChange: (config: PosLayout) => void
  editable: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [dragging, setDragging] = useState<PosPanel | null>(null)
  const resize = useRef<{ x: number; width: number } | null>(null)
  useEffect(() => {
    const root = host.current!
    const measure = () => setScale(Math.min(1, Math.max(0.2, (root.clientWidth - 24) / 1280)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const root = canvas.current!
    const measure = () => {
      const base = root.getBoundingClientRect()
      setBoxes(
        (Object.keys(posComponents) as PosPanel[]).flatMap((id) => {
          const element = root.querySelector<HTMLElement>(`[data-pos-slot="${id}"]`)
          if (!element) return []
          const r = element.getBoundingClientRect()
          return [
            {
              id,
              left: (r.left - base.left) / scale,
              top: (r.top - base.top) / scale,
              width: r.width / scale,
              height: r.height / scale,
            },
          ]
        }),
      )
    }
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    const timer = setTimeout(measure, 350)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [config, scale])
  function reorder(target: PosPanel) {
    if (!editable || !dragging || target === dragging) return
    const panels = config.panels.filter((id) => id !== dragging)
    panels.splice(config.panels.indexOf(target), 0, dragging)
    onChange({ ...config, panels })
    setDragging(null)
  }
  return (
    <section className="studio-canvas-host" ref={host} aria-label="Vista previa real de Terminal">
      <header>
        <strong>Terminal POS · componentes reales</strong>
        <span>{Math.round(scale * 100)}% · Selecciona un panel</span>
      </header>
      <div className="studio-canvas-space" style={{ height: 740 * scale }}>
        <div className="studio-canvas" ref={canvas} style={{ transform: `scale(${scale})` }}>
          <div className="studio-pos-render" inert>
            <OrderComposer terminal studioPreview={config} />
          </div>
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
                draggable={editable}
                onClick={() => onSelect(box.id)}
                onDragStart={() => setDragging(box.id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (editable) event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  reorder(box.id)
                }}
              >
                <span>{posComponents[box.id].name}</span>
              </button>
              {selected === box.id && box.id === 'order' && editable && (
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
        Guías sin superposición: posiciones en columnas válidas. La vista previa no toma pedidos ni
        registra cobros.
      </p>
    </section>
  )
}
