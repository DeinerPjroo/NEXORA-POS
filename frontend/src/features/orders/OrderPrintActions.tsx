import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Loading, Modal } from '../../components/ui'
import { useSession } from '../auth/SessionProvider'
import { Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { Order } from '../operations/types'
import type { KitchenTicket } from '../kitchen/types'
import { PrintDocumentPreview } from '../../components/PrintDocumentPreview'

export type PrintDraft = {
  orderId?: number
  channel: Order['channel']
  branch?: string
  table?: string
  customer?: string | null
  reference?: string | null
  notes?: string | null
  currency: string
  subtotal: string
  pending?: boolean
  lines: {
    name: string
    quantity: number
    amount?: string
    notes?: string | null
    destination?: string
    preparations?: string[]
  }[]
}
const channels = { dine_in: 'Mesa', takeaway: 'Para llevar · Recogida', delivery: 'Domicilio' }
const states = {
  new: 'Nueva',
  preparing: 'En preparación',
  ready: 'Lista',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
}

export function orderDraft(order: Order): PrintDraft {
  return {
    orderId: order.id,
    channel: order.channel,
    branch: order.branch_name,
    table: order.dining_snapshot?.tables.map((t) => t.name).join(', '),
    customer: order.customer_name,
    reference: order.reference,
    notes: order.notes,
    currency: order.currency,
    subtotal: order.subtotal,
    lines: (order.items ?? []).map((item) => ({
      name: [item.product_name, item.variant_name].filter(Boolean).join(' · '),
      quantity: item.quantity,
      amount: item.line_subtotal,
      notes: item.notes,
      destination:
        item.preparation_destination ?? (order.channel === 'dine_in' ? 'table' : 'takeaway'),
      preparations: item.modifiers_snapshot?.flatMap((g) => g.options.map((o) => o.name)),
    })),
  }
}

export function OrderPrintActions({
  order,
  getDraft,
  disabled = false,
}: {
  order?: Order
  getDraft?: () => PrintDraft
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<PrintDraft | null>(null)
  const [tickets, setTickets] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={disabled || (!order?.items?.length && !getDraft)}
        onClick={() => setDraft(getDraft ? getDraft() : orderDraft(order!))}
      >
        Imprimir borrador
      </button>
      <button
        type="button"
        disabled={disabled || !order}
        title={!order ? 'Guarda y envía el pedido a cocina para obtener su comanda' : undefined}
        onClick={() => setTickets(true)}
      >
        Imprimir comanda
      </button>
      {draft && <PrintPreview draft={draft} onClose={() => setDraft(null)} />}
      {tickets && order && <TicketPicker orderId={order.id} onClose={() => setTickets(false)} />}
    </>
  )
}

function TicketPicker({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['order-kitchen-print', orderId, page],
    queryFn: ({ signal }) =>
      api<CatalogPage<KitchenTicket>>(`orders/${orderId}/kitchen-tickets?page=${page}`, { signal }),
    staleTime: 0,
  })
  return (
    <Modal title={`Comandas · Pedido #${orderId}`} onClose={onClose}>
      <p className="muted">
        Selecciona la comanda registrada. Imprimir no vuelve a enviar productos a cocina.
      </p>
      <ErrorNotice error={query.error} />
      {query.error && (
        <button type="button" onClick={() => void query.refetch()}>
          Reintentar consulta
        </button>
      )}
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <>
            {!query.data.data.length && (
              <p role="status">Todavía no hay comandas. Envía el pedido a cocina primero.</p>
            )}
            <div className="print-ticket-list">
              {query.data.data.map((ticket) => (
                <div key={ticket.id}>
                  <strong>
                    #{ticket.id} · {ticket.station_name}
                  </strong>
                  <span>
                    {states[ticket.status]} ·{' '}
                    {ticket.lines
                      .filter((line) => !line.item_change)
                      .reduce((sum, l) => sum + l.quantity, 0)}{' '}
                    unidades
                  </span>
                  <TicketPrintButton ticket={ticket} />
                </div>
              ))}
            </div>
            <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
          </>
        )
      )}
    </Modal>
  )
}

export function TicketPrintButton({ ticket }: { ticket: KitchenTicket }) {
  const [printing, setPrinting] = useState<KitchenTicket | null>(null)
  return (
    <>
      <button type="button" onClick={() => setPrinting(structuredClone(ticket))}>
        Imprimir comanda #{ticket.id}
      </button>
      {printing && <PrintPreview ticket={printing} onClose={() => setPrinting(null)} />}
    </>
  )
}

function PrintPreview({
  draft,
  ticket,
  onClose,
}: {
  draft?: PrintDraft
  ticket?: KitchenTicket
  onClose: () => void
}) {
  const { session, screenBlocked } = useSession()
  const [printedAt] = useState(() => new Date())
  const time = (value: Date) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: session!.company.timezone,
    }).format(value)
  if (!session || screenBlocked) return null
  const content = (width: string) => (
    <article className="operational-ticket" data-width={width}>
      <h2>{session!.company.name}</h2>
      <h1>{ticket ? 'COMANDA · COPIA' : 'BORRADOR DEL PEDIDO'}</h1>
      <p>
        Pedido{' '}
        {ticket ? `#${ticket.order_id}` : draft?.orderId ? `#${draft.orderId}` : 'sin guardar'}
      </p>
      {ticket ? (
        <>
          <h2>
            #{ticket.id} · {ticket.station_name}
          </h2>
          <p>{states[ticket.status]}</p>
          <p>
            {channels[ticket.order_snapshot.channel as Order['channel']] ??
              ticket.order_snapshot.channel}
          </p>
          {ticket.order_snapshot.customer_name && <h2>{ticket.order_snapshot.customer_name}</h2>}
          {ticket.order_snapshot.dining?.tables?.length ? (
            <p>
              {ticket.order_snapshot.dining.tables.map((t) => t.name ?? t.table_name).join(', ')} ·
              ubicación al enviar
            </p>
          ) : null}
          {ticket.order_snapshot.reference && <p>Referencia: {ticket.order_snapshot.reference}</p>}
          <p>Enviada: {time(new Date(ticket.created_at))}</p>
          {ticket.lines.map((line) => (
            <section className="ticket-line" key={line.id}>
              {line.item_change && (
                <p>
                  <b>
                    {line.item_change.replacement_item_id
                      ? 'REEMPLAZADO · NO PREPARAR'
                      : 'ANULADO · NO PREPARAR'}
                  </b>{' '}
                  · {line.item_change.reason}
                </p>
              )}
              <strong>
                {line.quantity} × {line.product_name}
                {line.variant_name ? ` · ${line.variant_name}` : ''}
              </strong>
              <b>
                {line.preparation_destination === 'table'
                  ? 'SERVIR EN MESA'
                  : 'EMPACAR · PARA LLEVAR'}
              </b>
              {line.preparations.map((p, i) => (
                <p key={i}>
                  {p.name}: {p.options.join(', ')}
                </p>
              ))}
              {line.notes && <p>Nota: {line.notes}</p>}
              {line.corrections?.map((c) => (
                <p key={c.id}>
                  Corrección: {c.reason} · {time(new Date(c.created_at))}
                </p>
              ))}
            </section>
          ))}
          {ticket.order_snapshot.notes && <p>Nota general: {ticket.order_snapshot.notes}</p>}
        </>
      ) : (
        draft && (
          <>
            <p>
              {channels[draft.channel]}
              {draft.branch ? ` · ${draft.branch}` : ''}
            </p>
            {draft.table && <h2>{draft.table}</h2>}
            {draft.customer && <h2>{draft.customer}</h2>}
            {draft.reference && <p>Referencia: {draft.reference}</p>}
            {draft.pending && (
              <p>
                <strong>INCLUYE PRODUCTOS SIN GUARDAR</strong>
              </p>
            )}
            {draft.lines.map((line, i) => (
              <section className="ticket-line" key={i}>
                <div>
                  <strong>
                    {line.quantity} × {line.name}
                  </strong>
                  <span>{line.amount ? formatMoney(line.amount, draft.currency) : ''}</span>
                </div>
                <b>{line.destination === 'table' ? 'Servir en mesa' : 'Empacar · Para llevar'}</b>
                {line.preparations?.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
                {line.notes && <p>Nota: {line.notes}</p>}
              </section>
            ))}
            {draft.notes && <p>Nota general: {draft.notes}</p>}
            <h2>Subtotal de productos: {formatMoney(draft.subtotal, draft.currency)}</h2>
            <p>
              Importe informativo. Impuestos, envío, descuentos y saldo se confirman en el cobro.
            </p>
          </>
        )
      )}
      <footer>
        <p>Impresión: {time(printedAt)}</p>
        <strong>NO ES FACTURA NI COMPROBANTE DE PAGO</strong>
      </footer>
    </article>
  )
  return (
    <PrintDocumentPreview
      title={ticket ? 'Imprimir comanda' : 'Imprimir borrador'}
      onClose={onClose}
    >
      {content}
    </PrintDocumentPreview>
  )
}
