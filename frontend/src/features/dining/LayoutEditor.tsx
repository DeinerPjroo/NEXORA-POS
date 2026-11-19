import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Field, ErrorNotice, useToast } from '../../components/ui'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { DiningRoom, DiningTable, Geometry, LayoutObject } from './types'

const kinds = { wall: 'Pared', door: 'Puerta', divider: 'División', decoration: 'Decoración' }
export function LayoutEditor({
  room: initialRoom,
  editable,
  onSaved,
  onClose,
}: {
  room: DiningRoom
  editable: boolean
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [room] = useState(() => structuredClone(initialRoom))
  const [tables, setTables] = useState(() => structuredClone(room.tables ?? []))
  const [objects, setObjects] = useState(() => structuredClone(room.objects))
  const [selected, setSelected] = useState<string | null>(null)
  const [kind, setKind] = useState<LayoutObject['kind']>('wall')
  const toast = useToast()
  const operation = useOperation<DiningRoom>(
    'dining-rooms/' + room.id + '/layout',
    async () => {
      await onSaved()
      toast('Distribución guardada.')
      onClose()
    },
    'PUT',
  )
  const drag = useRef<{
    key: string
    clientX: number
    clientY: number
    x: number
    y: number
    scale: number
  } | null>(null)
  const locked = !editable || operation.locked
  const item = selected?.startsWith('table:')
    ? tables.find((t) => 'table:' + t.id === selected)
    : objects.find((o) => 'object:' + o.id === selected)
  function update(key: string, change: Partial<Geometry & { label: string; color: string }>) {
    const apply = <T extends DiningTable | LayoutObject>(value: T): T => {
      const next = { ...value, ...change }
      if ('shape' in next && next.shape !== 'rectangle') {
        if (change.width !== undefined) next.height = next.width
        if (change.height !== undefined) next.width = next.height
      }
      next.x = Math.max(0, Math.min(next.x, 1000 - next.width))
      next.y = Math.max(0, Math.min(next.y, 700 - next.height))
      return next
    }
    if (key.startsWith('table:'))
      setTables((values) => values.map((t) => ('table:' + t.id === key ? apply(t) : t)))
    else setObjects((values) => values.map((o) => ('object:' + o.id === key ? apply(o) : o)))
  }
  function pointer(event: PointerEvent<SVGGElement>, key: string, geometry: Geometry) {
    setSelected(key)
    if (locked) return
    const svg = event.currentTarget.ownerSVGElement!
    drag.current = {
      key,
      clientX: event.clientX,
      clientY: event.clientY,
      x: geometry.x,
      y: geometry.y,
      scale: 1000 / svg.getBoundingClientRect().width,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<SVGGElement>) {
    const start = drag.current
    if (!start || locked) return
    update(start.key, {
      x: Math.round(start.x + (event.clientX - start.clientX) * start.scale),
      y: Math.round(start.y + (event.clientY - start.clientY) * start.scale),
    })
  }
  function addObject() {
    const object: LayoutObject = {
      id: crypto.randomUUID(),
      kind,
      label: kinds[kind],
      color: kind === 'decoration' ? '#74B88B' : '#697386',
      x: 80,
      y: 80,
      width: kind === 'decoration' ? 60 : 180,
      height: kind === 'decoration' ? 60 : 20,
      rotation: 0,
    }
    setObjects((values) => [...values, object])
    setSelected('object:' + object.id)
  }
  function save() {
    operation.send({
      revision: room.revision,
      schema_version: 1,
      tables: tables.map(({ id, x, y, width, height, rotation }) => ({
        id,
        x,
        y,
        width,
        height,
        rotation,
      })),
      objects,
    })
  }
  return (
    <section className="panel dining-layout">
      <div className="dining-layout-heading">
        <div>
          <h2>Distribución de {room.name}</h2>
          <p className="muted">
            Plano de 1000 × 700 · Selecciona un elemento para ajustar su posición y tamaño.
          </p>
        </div>
        <button className="button secondary" disabled={operation.locked} onClick={onClose}>
          Volver a las mesas
        </button>
      </div>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="dining-workspace">
        <div className="dining-board-wrap">
          <svg
            className="dining-board"
            viewBox="0 0 1000 700"
            role="img"
            aria-label={'Plano de ' + room.name}
            style={{ background: room.color }}
          >
            <defs>
              <pattern id="dining-grid" width="25" height="25" patternUnits="userSpaceOnUse">
                <path
                  d="M25 0H0V25"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="0.5"
                  opacity="0.35"
                />
              </pattern>
            </defs>
            <rect width="1000" height="700" fill="url(#dining-grid)" />
            {objects.map((o) => (
              <g
                key={o.id}
                role="button"
                tabIndex={0}
                aria-label={'Seleccionar ' + o.label}
                onFocus={() => setSelected('object:' + o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected('object:' + o.id)
                  }
                }}
                onPointerDown={(e) => pointer(e, 'object:' + o.id, o)}
                onPointerMove={move}
                onPointerUp={() => {
                  drag.current = null
                }}
                onPointerCancel={() => {
                  drag.current = null
                }}
                transform={
                  'translate(' +
                  o.x +
                  ' ' +
                  o.y +
                  ') rotate(' +
                  o.rotation +
                  ' ' +
                  o.width / 2 +
                  ' ' +
                  o.height / 2 +
                  ')'
                }
              >
                <rect
                  width={o.width}
                  height={o.height}
                  rx={o.kind === 'decoration' ? 20 : 2}
                  fill={o.color}
                  fillOpacity={o.kind === 'door' ? 0.35 : 1}
                  stroke={selected === 'object:' + o.id ? '#6046E8' : '#334155'}
                  strokeWidth={selected === 'object:' + o.id ? 4 : 1}
                  strokeDasharray={o.kind === 'divider' ? '8 4' : undefined}
                />
                <text
                  x={o.width / 2}
                  y={o.height / 2}
                  dy=".35em"
                  textAnchor="middle"
                  fill="#111827"
                  fontSize="12"
                  pointerEvents="none"
                >
                  {o.label.slice(0, 24)}
                </text>
              </g>
            ))}
            {tables.map((t) => (
              <g
                key={t.id}
                role="button"
                tabIndex={0}
                aria-label={'Seleccionar ' + t.name}
                onFocus={() => setSelected('table:' + t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected('table:' + t.id)
                  }
                }}
                onPointerDown={(e) => pointer(e, 'table:' + t.id, t)}
                onPointerMove={move}
                onPointerUp={() => {
                  drag.current = null
                }}
                onPointerCancel={() => {
                  drag.current = null
                }}
                transform={
                  'translate(' +
                  t.x +
                  ' ' +
                  t.y +
                  ') rotate(' +
                  t.rotation +
                  ' ' +
                  t.width / 2 +
                  ' ' +
                  t.height / 2 +
                  ')'
                }
              >
                {t.shape === 'circle' ? (
                  <ellipse
                    cx={t.width / 2}
                    cy={t.height / 2}
                    rx={t.width / 2}
                    ry={t.height / 2}
                    fill={t.color}
                    stroke={selected === 'table:' + t.id ? '#6046E8' : '#334155'}
                    strokeWidth={selected === 'table:' + t.id ? 5 : 2}
                  />
                ) : (
                  <rect
                    width={t.width}
                    height={t.height}
                    rx="8"
                    fill={t.color}
                    stroke={selected === 'table:' + t.id ? '#6046E8' : '#334155'}
                    strokeWidth={selected === 'table:' + t.id ? 5 : 2}
                  />
                )}
                <text
                  x={t.width / 2}
                  y={t.height / 2 - 4}
                  textAnchor="middle"
                  fill="#111827"
                  fontWeight="700"
                  fontSize="14"
                  stroke="#ffffff"
                  strokeWidth="3"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {t.name.slice(0, 20)}
                </text>
                <text
                  x={t.width / 2}
                  y={t.height / 2 + 16}
                  textAnchor="middle"
                  fill="#111827"
                  fontSize="12"
                  stroke="#ffffff"
                  strokeWidth="3"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {t.capacity} personas
                </text>
              </g>
            ))}
          </svg>
          <p className="muted">
            La distribución configura el espacio. La ocupación se registrará desde la operación de
            mesas.
          </p>
        </div>
        <aside className="dining-inspector">
          <Field label="Elemento seleccionado">
            <select
              aria-label="Elemento seleccionado"
              value={selected ?? ''}
              onChange={(e) => setSelected(e.target.value || null)}
            >
              <option value="">Selecciona en el plano</option>
              {tables.map((t) => (
                <option key={t.id} value={'table:' + t.id}>
                  {t.name}
                </option>
              ))}
              {objects.map((o) => (
                <option key={o.id} value={'object:' + o.id}>
                  {o.label || kinds[o.kind]}
                </option>
              ))}
            </select>
          </Field>
          {item && selected && (
            <fieldset disabled={locked} className="form-stack">
              <legend>{'name' in item ? item.name : item.label}</legend>
              <div className="form-grid">
                {(['x', 'y', 'width', 'height', 'rotation'] as const).map((field, i) => (
                  <Field
                    key={field}
                    label={['Posición X', 'Posición Y', 'Ancho', 'Alto', 'Rotación'][i]}
                  >
                    <input
                      type="number"
                      min={field === 'width' || field === 'height' ? ('shape' in item ? 32 : 1) : 0}
                      max={
                        field === 'rotation'
                          ? 359
                          : field === 'x'
                            ? 1000 - item.width
                            : field === 'y'
                              ? 700 - item.height
                              : 'shape' in item
                                ? 240
                                : field === 'width'
                                  ? 1000
                                  : 700
                      }
                      value={item[field]}
                      onChange={(e) => {
                        const value = e.currentTarget.valueAsNumber
                        if (Number.isFinite(value) && e.currentTarget.validity.valid)
                          update(selected, { [field]: value })
                      }}
                    />
                  </Field>
                ))}
              </div>
              {'kind' in item && (
                <>
                  <Field label="Etiqueta">
                    <input
                      maxLength={80}
                      value={item.label}
                      onChange={(e) => update(selected, { label: e.target.value })}
                    />
                  </Field>
                  <Field label="Color del objeto">
                    <input
                      type="color"
                      value={item.color}
                      onChange={(e) => update(selected, { color: e.target.value })}
                    />
                  </Field>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setObjects((values) => values.filter((o) => 'object:' + o.id !== selected))
                      setSelected(null)
                    }}
                  >
                    Retirar objeto
                  </button>
                </>
              )}
            </fieldset>
          )}
          {editable && (
            <fieldset disabled={locked} className="form-stack">
              <legend>Agregar al plano</legend>
              <Field label="Tipo de objeto">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as LayoutObject['kind'])}
                >
                  {Object.entries(kinds).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button secondary"
                disabled={objects.length >= 100}
                onClick={addObject}
              >
                Agregar objeto
              </button>
            </fieldset>
          )}
        </aside>
      </div>
      {editable && (
        <div className="form-actions">
          <span className="muted">
            Revisión {room.revision} · Los cambios se aplican al guardar.
          </span>
          <button className="button primary" disabled={operation.isPending} onClick={save}>
            {operation.isPending
              ? 'Guardando…'
              : operation.uncertain
                ? 'Reintentar mismo guardado'
                : 'Guardar distribución'}
          </button>
        </div>
      )}
    </section>
  )
}
