import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading, Modal, PageTitle, Submit } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'

type Zone = { id: number; name: string; fee: string; revision: number; is_active: boolean }
type Policy = {
  id: number
  revision: number
  is_enabled: boolean
  default_fee: string
  free_from: string | null
  tax_profile_id: number | null
  zones: Zone[]
}
type Settings = {
  policy: Policy | null
  currency: string
  profiles: { profile_id: number; name: string; revision: number }[]
}

export function DeliveryTariffsPage() {
  const context = useOperationContext()
  const [branch, setBranch] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const selected = branch ?? context.data?.branches.find((b) => b.is_active)?.id ?? null
  const query = useQuery({
    queryKey: ['delivery-tariff-settings', selected],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      api<{ data: Settings }>(`deliveries/tariff-settings?branch_id=${selected}`, { signal }),
  })
  return (
    <section className="terminal-orders">
      <PageTitle
        eyebrow="NEXORA DOMICILIOS"
        title="Tarifas de entrega"
        description="Tarifa general, zonas y envío gratis por sucursal."
        action={
          <Link
            className="button"
            to="/terminal/domicilios"
            aria-disabled={editing}
            onClick={(e) => {
              if (editing) e.preventDefault()
            }}
          >
            Volver a domicilios
          </Link>
        }
      />
      <OperationalBranchPicker
        branches={context.data?.branches ?? []}
        value={selected}
        disabled={editing}
        onChange={setBranch}
      />
      <ErrorNotice error={query.error || context.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data &&
        selected && (
          <TariffSettings
            key={selected}
            branch={selected}
            initial={query.data.data}
            onEditing={setEditing}
          />
        )
      )}
    </section>
  )
}

function TariffSettings({
  branch,
  initial,
  onEditing,
}: {
  branch: number
  initial: Settings
  onEditing: (value: boolean) => void
}) {
  const can = useCan()
  const client = useQueryClient()
  const [policyEditor, setPolicyEditor] = useState<Settings | null>(null)
  const [zoneEditor, setZoneEditor] = useState<{ policy: Policy; zone: Zone | null } | null>(null)
  const policy = initial.policy
  async function saved() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['delivery-tariff-settings', branch] }),
      client.invalidateQueries({ queryKey: ['delivery-tariff-context'] }),
    ])
  }
  function close() {
    setPolicyEditor(null)
    setZoneEditor(null)
    onEditing(false)
  }
  return (
    <>
      <div className="operation-toolbar">
        <span className={`pill ${policy?.is_enabled ? 'green' : 'neutral'}`}>
          {policy?.is_enabled ? 'Tarifas activas' : 'Sin cargo de entrega'}
        </span>
        <button
          className="button primary"
          onClick={() => {
            setPolicyEditor(structuredClone(initial))
            onEditing(true)
          }}
        >
          Configurar tarifa
        </button>
        {policy && (
          <button
            className="button"
            onClick={() => {
              setZoneEditor({ policy: structuredClone(policy), zone: null })
              onEditing(true)
            }}
          >
            Agregar zona
          </button>
        )}
      </div>
      <section className="panel">
        <p>
          Tarifa general:{' '}
          <strong>{formatMoney(policy?.default_fee ?? '0.00', initial.currency)}</strong>
        </p>
        <p>
          {policy?.free_from
            ? `Envío gratis desde ${formatMoney(policy.free_from, initial.currency)} en productos.`
            : 'Sin mínimo para envío gratis.'}
        </p>
        <p className="muted">
          La tarifa se confirma al guardar el pedido. No cambia los domicilios anteriores ni se
          descuenta con promociones del pedido.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Tarifa</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {policy?.zones.map((zone) => (
                <tr key={zone.id}>
                  <td>{zone.name}</td>
                  <td>
                    {formatMoney(zone.fee, initial.currency)}
                  </td>
                  <td>{zone.is_active ? 'Activa' : 'Archivada'}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setZoneEditor({
                          policy: structuredClone(policy),
                          zone: structuredClone(zone),
                        })
                        onEditing(true)
                      }}
                    >
                      Editar zona
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!policy?.zones.length && (
          <p className="muted">Sin zonas configuradas. Los pedidos usan la tarifa general.</p>
        )}
      </section>
      {policyEditor && (
        <PolicyEditor
          initial={policyEditor}
          branch={branch}
          onSaved={saved}
          onClose={close}
          canConfigureTax={can('sales.configure')}
        />
      )}
      {zoneEditor && <ZoneEditor {...zoneEditor} onSaved={saved} onClose={close} />}
    </>
  )
}

function PolicyEditor({
  initial,
  branch,
  onSaved,
  onClose,
  canConfigureTax,
}: {
  initial: Settings
  branch: number
  onSaved: () => Promise<void>
  onClose: () => void
  canConfigureTax: boolean
}) {
  const [enabled, setEnabled] = useState(initial.policy?.is_enabled ?? false)
  const [profileId, setProfileId] = useState(initial.policy?.tax_profile_id ?? '')
  const operation = useOperation<Policy>(
    'deliveries/tariff-settings',
    async () => {
      await onSaved()
      onClose()
    },
    'PUT',
  )
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const values = new FormData(e.currentTarget)
    const profile = initial.profiles.find((p) => p.profile_id === Number(profileId))
    operation.send({
      branch_id: branch,
      revision: initial.policy?.revision ?? 0,
      currency: initial.currency,
      is_enabled: enabled,
      default_fee: values.get('fee'),
      free_from: values.get('free') || null,
      tax_profile_id: profile?.profile_id ?? null,
      ...(profile ? { tax_profile_revision: profile.revision } : {}),
    })
  }
  return (
    <Modal title="Configurar entrega" onClose={onClose} locked={operation.locked}>
      <form onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Activar tarifas
          </label>
          <Field label={`Tarifa general (${initial.currency})`}>
            <input
              name="fee"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={initial.policy ? Number(initial.policy.default_fee).toFixed(2) : '0.00'}
            />
          </Field>
          <Field label="Envío gratis desde (opcional)">
            <input
              name="free"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                initial.policy?.free_from ? Number(initial.policy.free_from).toFixed(2) : ''
              }
            />
          </Field>
          <Field label="Perfil tributario del envío">
            <select
              value={profileId}
              required={enabled}
              onChange={(e) => setProfileId(Number(e.target.value) || '')}
            >
              <option value="">Seleccionar perfil</option>
              {initial.profiles.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {!initial.profiles.length && (
            <p className="notice">
              Configura un perfil tributario antes de activar las tarifas.{' '}
              {canConfigureTax && (
                <Link to="/ventas/impuestos" target="_blank" rel="noopener noreferrer">
                  Abrir impuestos
                </Link>
              )}
            </p>
          )}
        </fieldset>
        <Submit pending={operation.isPending}>
          {operation.uncertain ? 'Reintentar mismo envío' : 'Guardar tarifa'}
        </Submit>
      </form>
    </Modal>
  )
}

function ZoneEditor({
  policy,
  zone,
  onSaved,
  onClose,
}: {
  policy: Policy
  zone: Zone | null
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const operation = useOperation<Policy>(
    `deliveries/policies/${policy.id}/zones${zone ? '/' + zone.id : ''}`,
    async () => {
      await onSaved()
      onClose()
    },
    zone ? 'PUT' : 'POST',
  )
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const values = new FormData(e.currentTarget)
    operation.send({
      revision: policy.revision,
      ...(zone ? { zone_revision: zone.revision } : {}),
      name: values.get('name'),
      fee: values.get('fee'),
      is_active: values.get('active') === 'on',
    })
  }
  return (
    <Modal title={zone ? 'Editar zona' : 'Nueva zona'} onClose={onClose} locked={operation.locked}>
      <form onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked}>
          <Field label="Nombre de zona">
            <input name="name" maxLength={100} required defaultValue={zone?.name ?? ''} />
          </Field>
          <Field label="Tarifa">
            <input
              name="fee"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={zone ? Number(zone.fee).toFixed(2) : ''}
            />
          </Field>
          <label className="check-label">
            <input type="checkbox" name="active" defaultChecked={zone?.is_active ?? true} /> Zona
            activa
          </label>
        </fieldset>
        <Submit pending={operation.isPending}>
          {operation.uncertain ? 'Reintentar mismo envío' : 'Guardar zona'}
        </Submit>
      </form>
    </Modal>
  )
}
