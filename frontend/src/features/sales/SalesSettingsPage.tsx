import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, PageTitle, Submit, useToast } from '../../components/ui'
import { CatalogError } from '../catalog/catalog-ui'
import type { SalesSettings } from './types'

export function SalesSettingsPage() {
  const query = useQuery({
    queryKey: ['sales-settings'],
    queryFn: () => api<{ data: SalesSettings }>('sales/settings'),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <CatalogError error={query.error} onRetry={() => void query.refetch()} />
  return (
    <>
      <Link className="text-button product-back" to="/ventas">
        <ArrowLeft size={16} />
        Volver a ventas
      </Link>
      <PageTitle
        eyebrow="UN CÁLCULO EXPLÍCITO"
        title="Configuración de ventas"
        description="Confirma cómo se calcularán los nuevos cobros. Los recibos anteriores conservan sus importes."
      />
      <SettingsForm key={query.data.data.revision} initial={query.data.data} />
    </>
  )
}

function SettingsForm({ initial }: { initial: SalesSettings }) {
  const [mode, setMode] = useState(initial.tax_mode)
  const [rate, setRate] = useState(initial.tax_rate)
  const [revision] = useState(initial.revision)
  const [tips, setTips] = useState(initial.tip_enabled)
  const [tipMode, setTipMode] = useState(initial.tip_tax_mode ?? '')
  const client = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: (body: unknown) => api('sales/settings', { method: 'PUT', body }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['sales-settings'] })
      toast('Configuración de ventas confirmada.')
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    mutation.mutate({
      revision,
      confirmed: fields.get('confirmed') === 'on',
      tax_mode: mode,
      tax_name: fields.get('tax_name'),
      tax_rate: rate.replace(',', '.'),
      tip_enabled: tips,
      tip_tax_mode: tipMode || null,
    })
  }
  return (
    <form className="panel form-stack sales-settings-form" onSubmit={submit}>
      <div className="panel-heading">
        <h2>
          <SlidersHorizontal size={18} />
          Reglas de cálculo
        </h2>
        <span className={`pill ${initial.configured ? 'green' : 'neutral'}`}>
          {initial.configured ? 'Configurada' : 'Por confirmar'}
        </span>
      </div>
      <ErrorNotice error={mutation.error} />
      <fieldset disabled={mutation.isPending} className="form-stack">
        <Field label="Cálculo de impuesto">
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value as SalesSettings['tax_mode']
              setMode(next)
              if (next === 'none') setRate('0')
            }}
          >
            <option value="none">Sin impuesto adicional automático</option>
            <option value="exclusive">Porcentaje adicional sobre la base</option>
          </select>
        </Field>
        <p className="muted small">
          Los precios del catálogo se tratan como base. Elige el cálculo que corresponda a tu
          negocio; esta configuración no determina su régimen tributario. Los precios con impuesto
          incluido y varios impuestos por producto requieren una ampliación posterior.
        </p>
        <Field label="Nombre del impuesto">
          <input name="tax_name" defaultValue={initial.tax_name} required maxLength={40} />
        </Field>
        <Field label="Tasa adicional (%)">
          <input
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            disabled={mode === 'none'}
            inputMode="decimal"
            required
            pattern="[0-9]+([.,][0-9]{1,4})?"
          />
        </Field>
        <div className="notice">
          Redondeo comercial a dos decimales, con mitades hacia arriba. Primero se redondea el
          subtotal, después se resta el descuento y se calcula el impuesto adicional sobre esa base.
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={tips}
            onChange={(event) => setTips(event.target.checked)}
          />
          Permitir registro de propinas voluntarias
        </label>
        {tips && (
          <Field label="Tratamiento de la propina en la base">
            <select required value={tipMode} onChange={(event) => setTipMode(event.target.value)}>
              <option value="" disabled>
                Selecciona un tratamiento explícito
              </option>
              <option value="excluded">Fuera de la base del impuesto adicional</option>
              <option value="included">Incluir en la base del impuesto adicional</option>
            </select>
          </Field>
        )}
        {tips && (
          <p className="muted small">
            La empresa confirma este cálculo según su operación. No se agrega una propina automática
            ni se determina un régimen tributario.
          </p>
        )}
        <label className="check-line">
          <input name="confirmed" type="checkbox" required />
          Confirmo esta configuración para los próximos cobros.
        </label>
      </fieldset>
      <div className="form-actions">
        <Submit pending={mutation.isPending}>Confirmar configuración</Submit>
      </div>
    </form>
  )
}
