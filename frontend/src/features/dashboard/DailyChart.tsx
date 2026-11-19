import { useState } from 'react'
import { Field } from '../../components/ui'
import { formatMoney, moneyUnits } from '../../lib/money'
import type { DailyPoint } from './types'

export function DailyChart({
  points,
  currency,
  onDay,
}: {
  points: DailyPoint[]
  currency: string
  onDay: (day: string) => void
}) {
  const [kind, setKind] = useState<'sales_total' | 'net_paid_amount'>('sales_total')
  const [selected, setSelected] = useState('')
  const current = points.find((p) => p.date === selected) ?? points[0]
  const abs = (value: bigint) => (value < 0n ? -value : value)
  const max = points.reduce((value, p) => {
    const amount = abs(moneyUnits(p[kind]))
    return amount > value ? amount : value
  }, 1n)
  return (
    <section className="panel commercial-section" aria-label="Gráfico diario">
      <div className="commercial-heading">
        <div>
          <h2>Evolución del periodo</h2>
          <p className="muted">
            Selecciona un día. Los valores negativos aparecen debajo de la línea central.
          </p>
        </div>
        <Field label="Medida del gráfico">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="sales_total">Ventas registradas</option>
            <option value="net_paid_amount">Neto de cobros</option>
          </select>
        </Field>
      </div>
      <div className="commercial-chart" role="group" aria-label="Días del periodo">
        {points.map((p, index) => {
          const amount = moneyUnits(p[kind])
          const height = Number((abs(amount) * 4500n) / max) / 100
          return (
            <button
              key={p.date}
              type="button"
              className={'commercial-day ' + (p.date === current?.date ? 'selected' : '')}
              aria-label={p.date + ': ' + formatMoney(p[kind], currency)}
              aria-pressed={p.date === current?.date}
              tabIndex={p.date === current?.date ? 0 : -1}
              onFocus={() => setSelected(p.date)}
              onMouseEnter={() => setSelected(p.date)}
              onClick={() => setSelected(p.date)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const next =
                    points[
                      Math.max(
                        0,
                        Math.min(points.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)),
                      )
                    ]
                  setSelected(next.date)
                  ;(
                    e.currentTarget.parentElement?.querySelectorAll('button')[
                      points.indexOf(next)
                    ] as HTMLButtonElement | undefined
                  )?.focus()
                }
              }}
            >
              <span
                className={amount < 0n ? 'negative' : 'positive'}
                style={{ height: height + '%' }}
              />
              <small>
                {points.length <= 31 ? p.date.slice(-2) : index % 7 === 0 ? p.date.slice(-2) : ''}
              </small>
            </button>
          )
        })}
      </div>
      {!points.length && <p className="muted">Sin registros de esta moneda en el periodo.</p>}
      {current && (
        <div className="commercial-day-detail">
          <Field label="Día del gráfico">
            <select value={current.date} onChange={(e) => setSelected(e.target.value)}>
              {points.map((p) => (
                <option key={p.date} value={p.date}>
                  {p.date}
                </option>
              ))}
            </select>
          </Field>
          <p>
            <strong>{formatMoney(current[kind], currency)}</strong>
            <br />
            <span className="muted">
              {current.sales_count} ventas registradas · {current.date}
            </span>
          </p>
          <button type="button" className="button secondary" onClick={() => onDay(current.date)}>
            Consultar este día
          </button>
        </div>
      )}
    </section>
  )
}
