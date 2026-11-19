import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { localMinute } from '../dining/reservation-time'
import type { CommercialReport } from './types'
import { widgetNames, loadWidgets, saveWidgets } from './widgets'
import type { Widget } from './widgets'
import { DailyChart } from './DailyChart'
import './dashboard.css'

export function CommercialPanel() {
  const { session } = useSession()
  const can = useCan()
  const today = localMinute(Date.now(), session!.company.timezone).slice(0, 10)
  const [draftFrom, setDraftFrom] = useState(today.slice(0, 8) + '01')
  const [draftTo, setDraftTo] = useState(today)
  const [draftBranch, setDraftBranch] = useState('')
  const [range, setRange] = useState({ from: draftFrom, to: draftTo, branch: '' })
  const [currency, setCurrency] = useState(session!.company.currency)
  const preferenceKey = 'nexora:dashboard:' + session!.company.id + ':' + session!.user.id
  const [widgets, setWidgets] = useState(() => loadWidgets(preferenceKey))
  const params = new URLSearchParams({ from: range.from, to: range.to })
  if (range.branch) params.set('branch_id', range.branch)
  const query = useQuery({
    queryKey: ['commercial-dashboard', params.toString()],
    queryFn: ({ signal }) =>
      api<{ data: CommercialReport }>('workspace/commercial-dashboard?' + params, { signal }),
    refetchInterval: 30000,
  })
  const data = query.data?.data
  function apply(e: FormEvent) {
    e.preventDefault()
    setRange({ from: draftFrom, to: draftTo, branch: draftBranch })
  }
  function day(value: string) {
    setDraftFrom(value)
    setDraftTo(value)
    setRange((current) => ({ ...current, from: value, to: value }))
  }
  function quick(month: boolean) {
    const from = month ? today.slice(0, 8) + '01' : today
    setDraftFrom(from)
    setDraftTo(today)
    setRange((current) => ({ ...current, from, to: today }))
  }
  function toggle(key: Widget, enabled: boolean) {
    setWidgets((previous) => {
      const next = enabled ? [...previous, key] : previous.filter((v) => v !== key)
      saveWidgets(preferenceKey, next)
      return next
    })
  }
  const money = (value: string) => formatMoney(value, currency, session!.company.locale)
  const summary = data?.sales?.currencies.find((r) => r.currency === currency)
  const expense = data?.cash_expenses?.find((r) => r.currency === currency)
  const points = data?.sales?.series.filter((p) => p.currency === currency) ?? []
  const currencies = [
    ...new Set([
      data?.currency ?? currency,
      ...(data?.sales?.currencies.map((r) => r.currency) ?? []),
      ...(data?.cash_expenses?.map((r) => r.currency) ?? []),
    ]),
  ]
  const current = summary?.current
  return (
    <section className="commercial-dashboard">
      <div className="commercial-heading">
        <div>
          <p className="eyebrow">TU OPERACIÓN, EN CIFRAS REALES</p>
          <h2>Resumen comercial</h2>
          <p className="muted">
            Ventas por fecha de registro; cobros y devoluciones por la fecha de cada movimiento.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={16} />
          Actualizar métricas
        </button>
      </div>
      <form className="commercial-filters panel" onSubmit={apply}>
        <Field label="Desde">
          <input
            type="date"
            required
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            required
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </Field>
        <Field label="Sucursal del dashboard">
          <select value={draftBranch} onChange={(e) => setDraftBranch(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {data?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_active ? '' : ' · Archivada'}
              </option>
            ))}
          </select>
        </Field>
        <button className="button primary" disabled={query.isFetching}>
          Consultar periodo
        </button>
        <button type="button" className="text-button" onClick={() => quick(false)}>
          Hoy
        </button>
        <button type="button" className="text-button" onClick={() => quick(true)}>
          Este mes
        </button>
      </form>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="commercial-view-options">
              <span className="muted">
                {data.period.from} — {data.period.to} · {data.timezone}
                <br />
                Comparación: {data.period.previous_from} — {data.period.previous_to}, igual
                duración.
              </span>
              <Field label="Moneda de los indicadores">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <details>
                <summary>Personalizar esta vista</summary>
                <div className="commercial-widget-picker">
                  {Object.entries(widgetNames).map(([key, label]) => (
                    <label className="checkbox-line" key={key}>
                      <input
                        type="checkbox"
                        checked={widgets.includes(key as Widget)}
                        onChange={(e) => toggle(key as Widget, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                  <small className="muted">
                    Preferencia de esta sesión, por empresa y usuario.
                  </small>
                </div>
              </details>
            </div>
            {widgets.includes('totals') && (
              <>
                <div className="commercial-metrics">
                  {current &&
                    [
                      {
                        label: 'Ventas registradas',
                        value: current.sales_total,
                        detail:
                          current.sales_count +
                          ' ventas · Ticket medio ' +
                          money(current.average_ticket),
                        change: summary?.sales_change,
                      },
                      {
                        label: 'Cobros aplicados',
                        value: current.applied_amount,
                        detail: current.payment_count + ' pagos, sin sumar recibido ni cambio',
                      },
                      {
                        label: 'Devoluciones registradas',
                        value: current.refunded_amount,
                        detail: current.refund_count + ' compensaciones del periodo',
                      },
                      {
                        label: 'Neto de cobros',
                        value: current.net_paid_amount,
                        detail: 'Cobros menos devoluciones del periodo',
                        change: summary?.net_change,
                      },
                      {
                        label: 'Saldo actual de esas ventas',
                        value: current.balance_due,
                        detail: 'Pendiente actual de ventas creadas en el periodo',
                      },
                    ].map((card) => (
                      <article className="metric-card commercial-metric" key={card.label}>
                        <div>
                          <span>{card.label}</span>
                          <BarChart3 size={17} />
                        </div>
                        <strong>{money(card.value)}</strong>
                        <p>{card.detail}</p>
                        {card.change && (
                          <small className="muted">
                            Variación: {money(card.change.amount)}
                            {card.change.percent === null
                              ? ' · Sin base positiva anterior'
                              : ' · ' + card.change.percent + '%'}
                          </small>
                        )}
                      </article>
                    ))}
                  {data.cash_expenses !== null && (
                    <article className="metric-card commercial-metric">
                      <div>
                        <span>Egresos manuales de caja</span>
                        <BarChart3 size={17} />
                      </div>
                      <strong>{money(expense?.amount ?? '0')}</strong>
                      <p>{expense?.count ?? 0} movimientos · Devoluciones excluidas</p>
                    </article>
                  )}
                </div>
                {current && (
                  <p className="commercial-definition muted">
                    Ventas del periodo: impuestos registrados {money(current.tax_amount)} · Propinas{' '}
                    {money(current.tip_amount)}. Los cobros netos son flujo registrado, no ganancia;
                    los egresos de caja no representan todos los gastos del negocio.
                  </p>
                )}
                {!current && data.cash_expenses === null && (
                  <p className="notice">
                    Tu acceso al resumen no incluye indicadores de ventas ni caja. Solicita los
                    permisos de consulta correspondientes a tu administrador.
                  </p>
                )}
              </>
            )}
            {widgets.includes('live') && (
              <section className="panel commercial-section">
                <div className="commercial-heading">
                  <h2>Operación actual</h2>
                  <small className="muted">Al consultar · Sucursal seleccionada</small>
                </div>
                <div className="commercial-live">
                  {[
                    { label: 'Pedidos activos', value: data.live.orders_active, to: '/pedidos' },
                    { label: 'Mesas ocupadas', value: data.live.tables_occupied, to: '/salones' },
                    { label: 'Cajas abiertas', value: data.live.cash_sessions_open, to: '/caja' },
                  ]
                    .filter((item) => item.value !== null)
                    .map((item) => (
                      <Link key={item.label} to={item.to}>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                </div>
                {Object.values(data.live).every((v) => v === null) && (
                  <p className="muted">
                    Los indicadores de operación requieren permiso de consulta de su módulo.
                  </p>
                )}
              </section>
            )}
            {data.sales && widgets.includes('chart') && (
              <DailyChart points={points} currency={currency} onDay={day} />
            )}
            {data.sales && widgets.includes('methods') && (
              <section className="panel commercial-section">
                <h2>Métodos registrados</h2>
                <p className="muted">
                  Nombre y tipo conservados al aplicar el pago. Los medios no efectivos son
                  registros declarados por el operador.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Método</th>
                        <th>Cobros</th>
                        <th>Devoluciones</th>
                        <th>Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.methods
                        .filter((m) => m.currency === currency)
                        .map((m, i) => (
                          <tr key={i}>
                            <td>
                              {m.name}
                              <small className="muted">
                                {' '}
                                ·{' '}
                                {m.kind === 'non_cash'
                                  ? 'Manual no efectivo'
                                  : m.kind === 'cash'
                                    ? 'Efectivo'
                                    : 'Histórico'}
                              </small>
                            </td>
                            <td>{money(m.applied_amount)}</td>
                            <td>{money(m.refunded_amount)}</td>
                            <td>{money(m.net_paid_amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!data.sales.methods.some((m) => m.currency === currency) && (
                  <p className="muted">Sin movimientos de esta moneda en el periodo.</p>
                )}
              </section>
            )}
            {data.sales && widgets.includes('products') && (
              <div className="commercial-rankings">
                <section className="panel commercial-section">
                  <h2>Productos registrados en ventas</h2>
                  <p className="muted">
                    Hasta 10 por moneda · Unidades brutas; un combo cuenta como producto, sin
                    duplicar sus componentes. Las devoluciones monetarias no asignan unidades
                    devueltas.
                  </p>
                  {data.sales.products
                    .filter((p) => p.currency === currency)
                    .map((p, index) => (
                      <div className="commercial-rank" key={p.product_id}>
                        <span>{index + 1}</span>
                        {can('catalog.view') ? (
                          <Link to={'/productos/' + p.product_id}>{p.name}</Link>
                        ) : (
                          <span>{p.name}</span>
                        )}
                        <strong>{p.quantity} unidades</strong>
                      </div>
                    ))}
                  {!data.sales.products.some((p) => p.currency === currency) && (
                    <p className="muted">Sin productos vendidos en este periodo.</p>
                  )}
                </section>
                <section className="panel commercial-section">
                  <h2>Ventas por hora de registro</h2>
                  <p className="muted">
                    Horario de {data.timezone} · No representa la hora de cada abono.
                  </p>
                  {data.sales.hours
                    .filter((h) => h.currency === currency)
                    .map((h) => (
                      <div className="commercial-rank" key={h.hour}>
                        <span>{h.hour}:00</span>
                        <span>{h.count} ventas</span>
                        <strong>{money(h.amount)}</strong>
                      </div>
                    ))}
                </section>
                <section className="panel commercial-section">
                  <h2>Operadores que registraron ventas</h2>
                  <p className="muted">Conteo y total registrado · Hasta 10 por moneda.</p>
                  {data.sales.operators
                    .filter((o) => o.currency === currency)
                    .map((o) => (
                      <div className="commercial-rank" key={o.user_id}>
                        <span>{o.name}</span>
                        <span>{o.count} ventas</span>
                        <strong>{money(o.amount)}</strong>
                      </div>
                    ))}
                </section>
              </div>
            )}
            <p className="muted commercial-as-of">
              Consultado:{' '}
              {new Date(data.generated_at).toLocaleString('es-CO', { timeZone: data.timezone })} ·
              Actualización cada 30 segundos. Los saldos se consultan al momento del reporte.
            </p>
          </>
        )
      )}
    </section>
  )
}
