import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Banknote, RefreshCw } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatMoney, moneyUnits, unitsToMoney } from '../../lib/money'
import { ErrorNotice, Field, Loading, PageTitle, Submit } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { CatalogError } from '../catalog/catalog-ui'
import type { Order } from '../operations/types'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import { SaleAmounts } from './SaleAmounts'
import { SaleReceipt } from './SaleReceipt'
import { PaymentMethodField, useDefaultPaymentMethod } from './PaymentMethodPicker'
import { SaleAdjustments, useSaleAdjustments } from './SaleAdjustments'
import type { PaymentMethod, Sale, SaleQuote, SalesSettings } from './types'
import { useSalesCash } from './useSalesCash'

export function CheckoutPage() {
  const { orderId = '' } = useParams()
  const can = useCan()
  const query = useQuery({
    queryKey: ['order', Number(orderId)],
    queryFn: ({ signal }) =>
      api<{ data: Order }>(`orders/${encodeURIComponent(orderId)}`, { signal }),
  })
  const settings = useQuery({
    queryKey: ['sales-settings'],
    queryFn: () => api<{ data: SalesSettings }>('sales/settings'),
  })
  if (query.error || settings.error)
    return (
      <CatalogError
        error={query.error || settings.error}
        onRetry={() => {
          void query.refetch()
          void settings.refetch()
        }}
      />
    )
  if (query.isPending || settings.isPending) return <Loading />
  const order = query.data.data
  return (
    <>
      <Link className="text-button product-back" to={`/pedidos/${order.id}`}>
        <ArrowLeft size={16} />
        Volver al pedido
      </Link>
      <PageTitle
        eyebrow="DEL PEDIDO A LA VENTA"
        title={`Cobrar pedido #${order.id}`}
        description={`${order.branch_name} · Registro de pago · ${order.currency}`}
      />
      {order.sale_id ? (
        <div className="panel empty-state">
          <h2>Este pedido ya tiene una venta.</h2>
          {can('sales.view') && (
            <Link className="button primary" to={`/ventas/${order.sale_id}`}>
              Ver recibo
            </Link>
          )}
        </div>
      ) : order.status === 'cancelled' ? (
        <div className="notice">Este pedido está cancelado y no puede cobrarse.</div>
      ) : !settings.data.data.configured ? (
        <div className="panel empty-state">
          <h2>Confirma el cálculo antes de cobrar.</h2>
          <p>La empresa debe elegir el tratamiento de impuestos y confirmar el redondeo.</p>
          {can('sales.configure') ? (
            <Link className="button primary" to="/ventas/configuracion">
              Configurar ventas
            </Link>
          ) : (
            <p>Solicita la configuración a una persona con permiso para administrar ventas.</p>
          )}
        </div>
      ) : (
        <CheckoutForm order={order} settings={settings.data.data} />
      )}
    </>
  )
}

function CheckoutForm({ order, settings }: { order: Order; settings: SalesSettings }) {
  const can = useCan()
  const client = useQueryClient()
  const navigate = useNavigate()
  const adjustments = useSaleAdjustments()
  const [cashId, setCashId] = useState('')
  const [received, setReceived] = useState('')
  const [paymentAmount, setPaymentAmount] = useState<string | null>(null)
  const [result, setResult] = useState<Sale | null>(null)
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod | null>(null)
  const methods = useDefaultPaymentMethod()
  const method = chosenMethod ?? methods.data?.data[0]
  const isCash = method?.kind === 'cash'
  const quote = useQuery({
    queryKey: ['sale-quote', order.id, adjustments.params],
    queryFn: ({ signal }) =>
      api<{ data: SaleQuote }>(`orders/${order.id}/quote?${adjustments.params}`, { signal }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  })
  const cash = useSalesCash(order.branch_id)
  const selected =
    cash.data?.data.find((item) => String(item.id) === cashId) ??
    (cashId === '' ? cash.data?.data[0] : undefined)
  const operation = useOperation<Sale>(`orders/${order.id}/collect`, async (sale) => {
    if (!can('sales.view')) setResult(sale)
    await Promise.all(
      [
        'sales',
        ...(can('sales.view') ? ['order'] : []),
        'orders',
        'cash-registers',
        'cash-sessions',
        'cash-session',
        'cash-movements',
        'checkout-cash',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    if (can('sales.view')) navigate(`/ventas/${sale.id}`)
  })
  const normalizedReceived = received.replace(',', '.')
  const normalizedPayment = (
    paymentAmount ??
    quote.data?.data.total.replace(/00$/, '') ??
    '0'
  ).replace(',', '.')
  const paymentValid =
    /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(normalizedPayment) &&
    moneyUnits(normalizedPayment) > 0n &&
    !!quote.data &&
    moneyUnits(normalizedPayment) <= moneyUnits(quote.data.data.total)
  let change: string | null = null
  if (paymentValid && /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(normalizedReceived)) {
    const difference = moneyUnits(normalizedReceived) - moneyUnits(normalizedPayment)
    if (difference >= 0n) change = unitsToMoney(difference)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!quote.data || !selected || !method) return
    operation.send({
      order_revision: quote.data.data.order_revision,
      settings_revision: quote.data.data.settings_revision,
      cash_session_id: selected.id,
      cash_revision: selected.revision,
      ...adjustments.payload,
      discount_reason: new FormData(event.currentTarget).get('discount_reason') || null,
      payment_method_id: method.id,
      method_revision: method.revision,
      payment_reference: new FormData(event.currentTarget).get('payment_reference') || null,
      payment_amount: normalizedPayment,
      received_amount: isCash ? normalizedReceived : normalizedPayment,
      expected_total: quote.data.data.total.replace(/00$/, ''),
    })
  }
  if (result) return <SaleReceipt sale={result} />
  return (
    <div className="checkout-layout">
      <form className="panel form-stack checkout-form" onSubmit={submit}>
        <div className="panel-heading">
          <h2>
            <Banknote size={19} />
            Registrar cobro
          </h2>
        </div>
        <ErrorNotice error={operation.error || cash.error || quote.error || methods.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <PaymentMethodField method={method} onPick={setChosenMethod} />
          {can('sales.view') && (
            <Field
              label="Importe de este pago"
              hint="Puedes registrar el total o un abono. El resto quedará como saldo pendiente."
            >
              <input
                value={paymentAmount ?? quote.data?.data.total.replace(/00$/, '') ?? ''}
                onChange={(event) => setPaymentAmount(event.target.value)}
                inputMode="decimal"
                required
                pattern="[0-9]+([.,][0-9]{1,2})?"
              />
            </Field>
          )}
          {!isCash && method && (
            <>
              <p className="notice">
                Registro manual no efectivo. No se verifica con una pasarela ni modifica el efectivo
                de caja.
              </p>
              <Field label="Referencia del pago">
                <input name="payment_reference" required maxLength={120} />
              </Field>
            </>
          )}
          <SaleAdjustments
            state={adjustments}
            canDiscount={can('sales.discount')}
            canTip={settings.tip_enabled && can('sales.tips')}
            fetching={quote.isFetching}
          />
          <Field label="Caja para recibir el cobro">
            <select
              value={selected?.id ?? ''}
              onChange={(event) => setCashId(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona una caja abierta
              </option>
              {cash.data?.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · Sesión #{item.id}
                </option>
              ))}
            </select>
          </Field>
          {!cash.isPending && !cash.data?.data.length && (
            <p className="notice">
              No hay cajas abiertas en esta sucursal.
              {can('cash.view') && <Link to="/caja"> Ir a caja</Link>}
            </p>
          )}
          {isCash && (
            <>
              <Field
                label="Efectivo recibido"
                hint="Registra el dinero entregado por el cliente. El servidor confirma el cambio."
              >
                <input
                  value={received}
                  onChange={(event) => setReceived(event.target.value)}
                  inputMode="decimal"
                  required
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  autoComplete="off"
                />
              </Field>
              <div className="checkout-change">
                <span>Cambio a entregar</span>
                <strong>{change === null ? '—' : formatMoney(change, order.currency)}</strong>
              </div>
            </>
          )}
        </fieldset>
        {operation.error instanceof ApiError && operation.error.status === 409 && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              operation.reset()
              adjustments.reset()
              void client.invalidateQueries({ queryKey: ['sales-settings'] })
              void quote.refetch()
              void cash.refetch()
              setChosenMethod(null)
              void methods.refetch()
              void client.invalidateQueries({ queryKey: ['order', order.id] })
            }}
          >
            <RefreshCw size={16} />
            Revisar datos actuales
          </button>
        )}
        <p className="muted small">
          {isCash
            ? 'Al confirmar registras una venta y el ingreso neto de efectivo en caja.'
            : 'Al confirmar registras una venta con pago manual no efectivo, sin movimiento de efectivo.'}{' '}
          El recibo es interno; no es una factura electrónica.
        </p>
        <Submit
          pending={operation.isPending}
          disabled={
            !operation.uncertain &&
            (!quote.data ||
              quote.isError ||
              quote.isFetching ||
              !selected ||
              !adjustments.ready ||
              !method ||
              !paymentValid ||
              methods.isError ||
              (isCash && change === null))
          }
        >
          {operation.uncertain
            ? 'Reintentar cobro'
            : isCash
              ? 'Confirmar cobro en efectivo'
              : 'Confirmar pago manual'}
        </Submit>
      </form>
      <section className="panel checkout-summary">
        <div className="panel-heading">
          <h2>Resumen del cobro</h2>
          <span className="pill neutral">Pedido #{order.id}</span>
        </div>
        {order.items?.map((item) => (
          <div className="checkout-order-line" key={item.id}>
            <span>
              {item.quantity}× {item.product_name}
              {item.variant_name && ` · ${item.variant_name}`}
            </span>
            <strong>{formatMoney(item.line_subtotal, order.currency)}</strong>
          </div>
        ))}
        {quote.isPending ? (
          <Loading />
        ) : quote.data && !quote.error ? (
          <SaleAmounts amounts={quote.data.data} />
        ) : (
          <p className="muted">Revisa los datos para calcular el total.</p>
        )}
        <p className="muted small">
          Subtotal y cálculo confirmados por el servidor. Redondeo a dos decimales, mitades hacia
          arriba.
        </p>
      </section>
    </div>
  )
}
