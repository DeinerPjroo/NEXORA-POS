import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { ErrorNotice, Field } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useDebounce } from '../catalog/catalog-ui'
import { cartSubtotal, serializeCart, type CartLine } from './cart'
import { SaleAmounts } from '../sales/SaleAmounts'
import type { DeliveryCharge, SaleQuote } from '../sales/types'

type Context = {
  revision: number
  is_enabled: boolean
  zones: { id: number; name: string; fee: string; revision: number }[]
}
type Fee = {
  fee_total: string
  fee_snapshot: DeliveryCharge | null
  quote: Omit<SaleQuote, 'order_revision' | 'accounts_preview'> | null
  sales_configured: boolean
}
export function DeliveryFeeFields({
  branchId,
  currency,
  lines,
  onReady,
  onDirty,
  onReviewPrices,
}: {
  branchId: number | null
  currency: string
  lines: CartLine[]
  onReady: (ready: boolean) => void
  onDirty: (dirty: boolean) => void
  onReviewPrices: () => void
}) {
  const can = useCan()
  const [zone, setZone] = useState('')
  const [manual, setManual] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const valid =
    !manual ||
    (/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(amount) && reason.trim().length >= 3)
  const context = useQuery({
    queryKey: ['delivery-tariff-context', branchId],
    queryFn: ({ signal }) =>
      api<{ data: Context }>(`deliveries/tariff-context?branch_id=${branchId}`, { signal }),
    enabled: !!branchId,
  })
  const payload = JSON.stringify({
    product_subtotal: cartSubtotal(lines),
    ...(lines.length ? { items: serializeCart(lines, true) } : {}),
    ...(zone ? { delivery_zone_id: Number(zone) } : {}),
    ...(manual ? { fee_override: amount, fee_override_reason: reason } : {}),
  })
  const debounced = useDebounce(payload)
  const query = useQuery({
    queryKey: ['delivery-fee-preview', branchId, currency, context.data?.data.revision, debounced],
    queryFn: ({ signal }) =>
      api<{ data: Fee }>('deliveries/fee-preview', {
        method: 'POST',
        body: { branch_id: branchId, currency, ...JSON.parse(debounced) },
        signal,
      }),
    enabled: !!branchId && !!context.data && valid && payload === debounced,
    refetchOnWindowFocus: false,
  })
  const fee = query.data?.data
  const ready =
    !!fee && valid && payload === debounced && !query.isFetching && !query.error && !context.error
  useEffect(() => {
    onReady(ready)
    return () => onReady(false)
  }, [ready, onReady])
  useEffect(() => {
    onDirty(!!zone || manual)
  }, [zone, manual, onDirty])
  const snapshot = fee?.fee_snapshot
  return (
    <section className="pos-delivery-fee" aria-label="Tarifa de domicilio">
      <header>
        <strong>Domicilio</strong>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onReviewPrices()
            void context.refetch()
            void query.refetch()
          }}
        >
          Revisar tarifa y precios
        </button>
      </header>
      <ErrorNotice error={context.error || query.error} />
      {context.data?.data.is_enabled ? (
        <Field label="Zona de entrega">
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Tarifa general</option>
            {context.data.data.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <small>La sucursal no tiene una tarifa habilitada. No se agregará un cargo.</small>
      )}
      {can('deliveries.override_fee') && context.data?.data.is_enabled && (
        <>
          <label className="checkbox-label">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            Ajustar tarifa con autorización
          </label>
          {manual && (
            <>
              <Field label="Tarifa manual antes de impuestos">
                <input
                  name="delivery_fee_override"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Motivo del ajuste de tarifa">
                <input
                  name="delivery_fee_override_reason"
                  maxLength={250}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              {!valid && (
                <small>
                  Indica un importe con hasta dos decimales y un motivo de al menos 3 caracteres.
                </small>
              )}
            </>
          )}
        </>
      )}
      <input type="hidden" name="delivery_zone_id" value={zone} />
      <input
        type="hidden"
        name="delivery_fee_policy_revision"
        value={snapshot?.policy_revision ?? context.data?.data.revision ?? ''}
      />
      <input
        type="hidden"
        name="delivery_fee_profile_revision"
        value={snapshot?.profile.revision ?? ''}
      />
      <input
        type="hidden"
        name="delivery_fee_zone_revision"
        value={snapshot?.zone_revision ?? ''}
      />
      <input type="hidden" name="delivery_expected_fee_total" value={ready ? fee!.fee_total : ''} />
      {!ready && !query.error && (
        <small role="status">
          {valid ? 'Consultando tarifa e impuestos…' : 'Completa el ajuste para cotizar.'}
        </small>
      )}
      {ready && (
        <div className="pos-fee-totals">
          <span>Tarifa con sus impuestos</span>
          <strong>{formatMoney(fee!.fee_total, currency)}</strong>
          {fee?.quote && (
            <>
              <span>Total previsto sin ajustes de cobro</span>
              <strong>{formatMoney(fee.quote.total, currency)}</strong>
            </>
          )}
        </div>
      )}
      {ready && fee?.quote && (
        <details>
          <summary>Desglose de productos, impuestos y domicilio</summary>
          <SaleAmounts amounts={fee.quote} />
        </details>
      )}
      {ready && !fee?.sales_configured && (
        <small>
          La configuración de ventas está pendiente. El total final se confirma al cobrar.
        </small>
      )}
    </section>
  )
}
