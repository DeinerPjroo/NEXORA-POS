import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WalletCards } from 'lucide-react'
import { api } from '../../lib/api'
import { Loading, Modal } from '../../components/ui'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import type { PaymentMethod } from './types'

export function useDefaultPaymentMethod() {
  return useQuery({
    queryKey: ['payment-methods', 'default-active'],
    queryFn: () => api<CatalogPage<PaymentMethod>>('payment-methods?status=active&per_page=10'),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function PaymentMethodField({
  method,
  onPick,
}: {
  method?: PaymentMethod
  onPick: (method: PaymentMethod) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        <WalletCards size={17} />
        Método: {method?.name ?? 'Elegir método'}
      </button>
      {open && (
        <MethodPicker
          onClose={() => setOpen(false)}
          onPick={(item) => {
            onPick(item)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function MethodPicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (method: PaymentMethod) => void
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['payment-methods', 'picker', page],
    queryFn: ({ signal }) =>
      api<CatalogPage<PaymentMethod>>(`payment-methods?status=active&per_page=10&page=${page}`, {
        signal,
      }),
  })
  return (
    <Modal title="Elige un método de pago" onClose={onClose}>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="order-variant-options">
            {query.data.data.map((method) => (
              <button
                className="order-variant-option"
                key={method.id}
                onClick={() => onPick(method)}
              >
                <WalletCards size={18} />
                <span>
                  <strong>{method.name}</strong>
                  <small>
                    {method.kind === 'cash' ? 'Efectivo' : 'Registro manual no efectivo'}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {!query.data.data.length && (
            <p className="empty-inline muted">No hay métodos activos en esta página.</p>
          )}
          <Pagination meta={query.data.meta} pending={query.isFetching} onPage={setPage} />
        </>
      )}
    </Modal>
  )
}
