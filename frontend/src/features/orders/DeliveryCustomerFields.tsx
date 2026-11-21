import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Field, ErrorNotice, Modal } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useDebounce } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'

type Contact = {
  recipient_name: string
  phone: string
  address: string
  neighborhood: string
  location_reference: string
  instructions: string
}
type Address = Contact & { id: number; revision: number; label: string; is_active: boolean }
type Customer = {
  id: number
  revision: number
  name: string
  phone: string
  addresses: Address[]
  saved_address_id?: number | null
}
const blank: Contact = {
  recipient_name: '',
  phone: '',
  address: '',
  neighborhood: '',
  location_reference: '',
  instructions: '',
}
const fields = [
  ['recipient_name', 'delivery_name', 'Nombre de quien recibe', 100],
  ['phone', 'delivery_phone', 'Teléfono del domicilio', 30],
  ['address', 'delivery_address', 'Dirección de entrega', 300],
  ['neighborhood', 'delivery_neighborhood', 'Barrio o zona', 100],
  ['location_reference', 'delivery_location_reference', 'Referencias de ubicación', 300],
  ['instructions', 'delivery_instructions', 'Indicaciones de entrega', 300],
] as const

export function DeliveryCustomerFields({
  branchId,
  onBusy,
  onDirty,
}: {
  branchId: number | null
  onBusy: (busy: boolean) => void
  onDirty: (dirty: boolean) => void
}) {
  const can = useCan()
  const root = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const text = useDebounce(search)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [address, setAddress] = useState<Address | null>(null)
  const [contact, setContact] = useState<Contact>(blank)
  const [saving, setSaving] = useState<{
    customer: Customer | null
    contact: Contact
    name: string
  } | null>(null)
  useEffect(() => {
    onDirty(Object.values(contact).some((value) => !!value?.trim()))
  }, [contact, onDirty])
  const canSave =
    !!contact.recipient_name.trim() &&
    contact.phone.trim().length >= 3 &&
    contact.address.trim().length >= 5
  const query = useQuery({
    queryKey: ['delivery-customer-search', branchId, text],
    queryFn: ({ signal }) =>
      api<CatalogPage<Customer>>(
        `customers?branch_id=${branchId}&search=${encodeURIComponent(text)}`,
        { signal },
      ),
    enabled: !!branchId && can('customers.view') && text.trim().length >= 2,
  })
  function select(c: Customer, a: Address | null = null) {
    setCustomer(c)
    setAddress(a)
    setContact(
      a
        ? (Object.fromEntries(fields.map(([key]) => [key, a[key] ?? ''])) as Contact)
        : { ...blank, recipient_name: c.name, phone: c.phone },
    )
    const name = root.current
      ?.closest('form')
      ?.elements.namedItem('customer_name') as HTMLInputElement | null
    if (name && !name.value) name.value = c.name
    setSearch('')
  }
  return (
    <div className="delivery-customer-fields" ref={root}>
      {can('customers.view') && (
        <>
          <Field label="Buscar cliente guardado">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o teléfono"
              autoComplete="off"
            />
          </Field>
          {text.trim().length >= 2 && (
            <>
              <ErrorNotice error={query.error} />
              {query.isFetching && <small role="status">Buscando clientes…</small>}
              <div className="delivery-address-options">
                {query.data?.data.map((c) => (
                  <button type="button" key={c.id} onClick={() => select(c)}>
                    {c.name} · {c.phone}
                  </button>
                ))}
              </div>
              {query.data && !query.data.data.length && (
                <small>
                  No hay clientes coincidentes. Puedes registrar uno con los datos de abajo.
                </small>
              )}
            </>
          )}
        </>
      )}
      {customer && (
        <div className="delivery-address-options" aria-label="Direcciones del cliente">
          <strong>{customer.name} · Direcciones guardadas</strong>
          {customer.addresses
            .filter((a) => a.is_active)
            .map((a) => (
              <button
                type="button"
                key={a.id}
                aria-pressed={address?.id === a.id}
                onClick={() => select(customer, a)}
              >
                {a.label} · {a.neighborhood || a.address}
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              setAddress(null)
              setContact({ ...blank, recipient_name: customer.name, phone: customer.phone })
            }}
          >
            Dirección nueva
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomer(null)
              setAddress(null)
            }}
          >
            Usar datos manuales
          </button>
        </div>
      )}
      <input type="hidden" name="delivery_customer_id" value={customer?.id ?? ''} />
      <input type="hidden" name="delivery_customer_revision" value={customer?.revision ?? ''} />
      <input type="hidden" name="delivery_customer_address_id" value={address?.id ?? ''} />
      <input type="hidden" name="delivery_address_revision" value={address?.revision ?? ''} />
      {address && (
        <small>
          Dirección guardada seleccionada. Se copiará al domicilio para conservar su historial.
        </small>
      )}
      {fields.map(([key, name, label, maxLength]) => (
        <Field key={key} label={label}>
          {key === 'address' || key === 'instructions' || key === 'location_reference' ? (
            <textarea
              name={name}
              maxLength={maxLength}
              rows={2}
              readOnly={!!address}
              value={contact[key] ?? ''}
              onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
            />
          ) : (
            <input
              name={name}
              maxLength={maxLength}
              type={key === 'phone' ? 'tel' : 'text'}
              readOnly={!!address}
              value={contact[key] ?? ''}
              onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
            />
          )}
        </Field>
      ))}
      {can('customers.manage') && can('customers.view') && !address && branchId && (
        <button
          type="button"
          className="button secondary"
          disabled={!canSave}
          title="Completa destinatario, teléfono y dirección para guardar"
          onClick={() => {
            if (
              !contact.recipient_name.trim() ||
              contact.phone.trim().length < 3 ||
              contact.address.trim().length < 5
            ) {
              const input = root.current?.querySelector<HTMLInputElement>('[name="delivery_name"]')
              input?.focus()
              return
            }
            const name =
              (
                root.current
                  ?.closest('form')
                  ?.elements.namedItem('customer_name') as HTMLInputElement | null
              )?.value || contact.recipient_name
            setSaving({ customer, contact: structuredClone(contact), name })
          }}
        >
          {customer ? 'Guardar esta dirección' : 'Guardar cliente y dirección'}
        </button>
      )}
      {saving &&
        branchId &&
        createPortal(
          <SaveCustomerContact
            value={saving}
            branchId={branchId}
            onBusy={onBusy}
            onClose={() => setSaving(null)}
            onSaved={(c) => {
              select(c, c.addresses.find((a) => a.is_active && a.id === c.saved_address_id) ?? null)
              setSaving(null)
            }}
          />,
          document.body,
        )}
    </div>
  )
}
function SaveCustomerContact({
  value,
  branchId,
  onBusy,
  onClose,
  onSaved,
}: {
  value: { customer: Customer | null; contact: Contact; name: string }
  branchId: number
  onBusy: (busy: boolean) => void
  onClose: () => void
  onSaved: (customer: Customer) => void
}) {
  useEffect(() => {
    onBusy(true)
    return () => onBusy(false)
  }, [onBusy])
  const operation = useOperation<Customer>(
    value.customer ? `customers/${value.customer.id}/addresses` : 'customers',
    onSaved,
  )
  return (
    <Modal
      title={value.customer ? 'Guardar dirección del cliente' : 'Guardar cliente y dirección'}
      onClose={onClose}
      locked={operation.locked}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (operation.uncertain) {
            operation.send({})
            return
          }
          const f = new FormData(e.currentTarget)
          const addressData = { ...value.contact, label: f.get('label'), is_active: true }
          operation.send(
            value.customer
              ? { ...addressData, revision: value.customer.revision }
              : {
                  branch_id: branchId,
                  name: f.get('name'),
                  phone: value.contact.phone,
                  initial_address: addressData,
                },
          )
        }}
      >
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <p>
          {value.contact.address}
          {value.contact.neighborhood ? ` · ${value.contact.neighborhood}` : ''}
        </p>
        <fieldset className="form-stack" disabled={operation.locked}>
          {!value.customer && (
            <Field label="Nombre del cliente guardado">
              <input name="name" required maxLength={100} defaultValue={value.name} />
            </Field>
          )}
          <Field label="Nombre de esta dirección">
            <input
              name="label"
              required
              maxLength={60}
              defaultValue="Principal"
              placeholder="Ej. Casa o trabajo"
            />
          </Field>
        </fieldset>
        <button type="submit" className="button primary" disabled={operation.isPending}>
          {operation.uncertain
            ? 'Reintentar mismo registro'
            : operation.isPending
              ? 'Guardando…'
              : 'Confirmar registro'}
        </button>
      </form>
    </Modal>
  )
}
