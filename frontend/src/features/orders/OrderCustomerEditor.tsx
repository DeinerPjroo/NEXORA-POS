import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserRound, X } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading } from '../../components/ui'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'

type Customer = {
  revision: number
  customer_name: string | null
  reference: string | null
  delivery: null | {
    revision: number
    recipient_name: string
    phone: string
    address: string
    instructions: string | null
  }
}

export function OrderCustomerEditor({
  orderId,
  onClose,
  onBusy,
}: {
  orderId: number
  onClose: () => void
  onBusy: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['order-customer-editor', orderId],
    queryFn: ({ signal }) => api<{ data: Customer }>(`orders/${orderId}/customer`, { signal }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
  })
  const operation = useOperation(
    `orders/${orderId}/customer`,
    async () => {
      await Promise.all(
        [
          'orders',
          'order',
          'table-active-order',
          'table-orders',
          'deliveries',
          'kitchen-tickets',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      )
      onClose()
    },
    'PUT',
  )
  useEffect(() => {
    onBusy(operation.locked)
    return () => onBusy(false)
  }, [onBusy, operation.locked])
  const data = query.data?.data
  return (
    <section className="pos-tables-inline pos-customer-edit" aria-label="Editar cliente del pedido">
      <header className="pos-client-heading">
        <span className="pos-client-icon">
          <UserRound size={22} />
        </span>
        <div>
          <span className="pos-digital-eyebrow">PEDIDO #{orderId}</span>
          <h3>Editar cliente</h3>
        </div>
        <button
          type="button"
          className="pos-detail-close"
          aria-label="Cerrar edición de cliente"
          disabled={operation.locked}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </header>
      <ErrorNotice error={query.error} />
      {query.error && (
        <button type="button" onClick={() => void query.refetch()}>
          Reintentar consulta
        </button>
      )}
      {query.isPending ? (
        <Loading />
      ) : (
        data && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (operation.uncertain) {
                operation.send({})
                return
              }
              const form = new FormData(event.currentTarget)
              operation.send({
                revision: data.revision,
                customer_name: form.get('customer_name') || null,
                reference: form.get('reference') || null,
                reason: form.get('reason'),
                ...(data.delivery
                  ? {
                      delivery: {
                        revision: data.delivery.revision,
                        recipient_name: form.get('recipient_name'),
                        phone: form.get('phone'),
                        address: form.get('address'),
                        instructions: form.get('instructions') || null,
                      },
                    }
                  : {}),
              })
            }}
          >
            <fieldset className="pos-client-fields" disabled={operation.locked}>
              <Field label="Nombre del cliente">
                <input
                  name="customer_name"
                  maxLength={100}
                  defaultValue={data.customer_name ?? ''}
                  autoFocus
                />
              </Field>
              <Field label="Referencia del pedido">
                <input name="reference" maxLength={80} defaultValue={data.reference ?? ''} />
              </Field>
              {data.delivery && (
                <>
                  <Field label="Nombre de quien recibe">
                    <input
                      name="recipient_name"
                      required
                      maxLength={100}
                      defaultValue={data.delivery.recipient_name}
                    />
                  </Field>
                  <Field label="Teléfono del domicilio">
                    <input
                      name="phone"
                      type="tel"
                      required
                      minLength={3}
                      maxLength={30}
                      defaultValue={data.delivery.phone}
                    />
                  </Field>
                  <Field label="Dirección de entrega">
                    <textarea
                      name="address"
                      required
                      minLength={5}
                      maxLength={300}
                      defaultValue={data.delivery.address}
                      rows={2}
                    />
                  </Field>
                  <Field label="Indicaciones de entrega">
                    <textarea
                      name="instructions"
                      maxLength={300}
                      defaultValue={data.delivery.instructions ?? ''}
                      rows={2}
                    />
                  </Field>
                </>
              )}
              <Field label="Motivo del cambio">
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={250}
                  placeholder="Ej. Recoge otra persona"
                />
              </Field>
            </fieldset>
            <footer className="pos-client-footer">
              <ErrorNotice error={operation.error} />
              <OperationNotice uncertain={operation.uncertain} />
              <small>El cambio queda registrado con tu usuario.</small>
              <button type="submit" disabled={operation.isPending}>
                {operation.isPending
                  ? 'Guardando…'
                  : operation.uncertain
                    ? 'Reintentar cambio'
                    : 'Guardar cambios'}
              </button>
            </footer>
          </form>
        )
      )}
    </section>
  )
}
