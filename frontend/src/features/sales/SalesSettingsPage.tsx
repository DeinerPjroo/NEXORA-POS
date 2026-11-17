import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, PageTitle, Submit, useToast } from '../../components/ui'
import { CatalogError } from '../catalog/catalog-ui'
import type { SalesSettings } from './types'
import { TaxProfilePicker } from './TaxProfilePicker'
import { snapshotChoice } from './tax-types'
import type { TaxChoice } from './tax-types'

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
        action={
          <Link className="button secondary" to="/ventas/impuestos">
            Perfiles de impuestos
          </Link>
        }
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
  const [tipProfile, setTipProfile] = useState<TaxChoice | null>(() =>
    snapshotChoice(initial.tip_tax_snapshot),
  )
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
      tax_name: mode === 'product' ? 'Impuestos por producto' : fields.get('tax_name'),
      tax_rate: rate.replace(',', '.'),
      tip_enabled: tips,
      tip_tax_mode: tipMode || null,
      ...(mode === 'product' && tips && tipMode === 'included'
        ? {
            tip_tax_profile_id: tipProfile?.id ?? null,
            ...(tipProfile ? { tip_tax_profile_revision: tipProfile.revision } : {}),
          }
        : {}),
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
              if (next === 'none' || next === 'product') setRate('0')
            }}
          >
            <option value="none">Sin impuesto adicional automático</option>
            <option value="exclusive">Porcentaje adicional sobre la base</option>
            <option value="inclusive">Impuesto incluido en los precios</option>
            <option value="product">Perfiles de impuestos por producto</option>
          </select>
        </Field>
        <p className="muted small">
          {mode === 'product'
            ? 'Se usan los perfiles conservados en cada pedido. Los productos sin perfil no agregan impuestos por producto. Revisa el desglose antes de cobrar. '
            : mode === 'inclusive'
              ? 'Se extrae la base y el impuesto del precio final; no se vuelve a sumar al total. '
              : 'Los precios del catálogo se tratan como base. '}
          Elige el cálculo que corresponda a tu negocio; esta configuración no determina su régimen
          tributario.
        </p>
        {mode !== 'product' && (
          <Field label="Nombre del impuesto">
            <input name="tax_name" defaultValue={initial.tax_name} required maxLength={40} />
          </Field>
        )}
        {mode !== 'product' && (
          <Field label={mode === 'inclusive' ? 'Tasa incluida (%)' : 'Tasa adicional (%)'}>
            <input
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              disabled={mode === 'none'}
              inputMode="decimal"
              required
              pattern="[0-9]+([.,][0-9]{1,4})?"
            />
          </Field>
        )}
        <div className="notice">
          {mode === 'product'
            ? 'Subtotal y descuento se distribuyen en centavos por proporción y mayores restos. Los impuestos incluidos se extraen; solo los adicionales se suman al precio. Las tasas paralelas usan la misma base.'
            : mode === 'inclusive'
              ? 'Después del descuento se extrae la base, redondeada a dos decimales con mitades hacia arriba. El impuesto es la diferencia respecto al importe participante, conservando el precio final.'
              : 'Redondeo comercial a dos decimales, con mitades hacia arriba. Primero se redondea el subtotal, después se resta el descuento y se calcula el impuesto adicional sobre esa base.'}
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
              <option value="excluded">Fuera del cálculo del impuesto</option>
              <option value="included">Participa en el cálculo del impuesto</option>
            </select>
          </Field>
        )}
        {tips && (
          <p className="muted small">
            La empresa confirma este cálculo según su operación. No se agrega una propina automática
            ni se determina un régimen tributario.{' '}
            {mode === 'inclusive' &&
              'Si participa, el impuesto se extrae del importe de propina aceptado; no se añade otro cobro.'}
          </p>
        )}
        {tips && tipMode === 'included' && mode === 'product' && (
          <div className="field">
            <span className="field-label">Perfil de impuestos para la propina</span>
            <TaxProfilePicker value={tipProfile} onChange={setTipProfile} allowNone={false} />
            <small className="muted">
              Las tasas de la propina quedan confirmadas hasta guardar una nueva selección. No se
              infieren de los productos.
            </small>
          </div>
        )}
        <label className="check-line">
          <input name="confirmed" type="checkbox" required />
          Confirmo esta configuración para los próximos cobros.
        </label>
      </fieldset>
      <div className="form-actions">
        <Submit
          pending={mutation.isPending}
          disabled={mode === 'product' && tips && tipMode === 'included' && !tipProfile}
        >
          Confirmar configuración
        </Submit>
      </div>
    </form>
  )
}
