import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import {
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageTitle,
  Submit,
  useToast,
} from '../../components/ui'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { OperationNotice } from '../operations/OperationNotice'
import { useOperation } from '../operations/useOperation'
import type { PaymentMethod } from './types'

export function PaymentMethodsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null)
  const params = new URLSearchParams({ page: String(page), per_page: '12' })
  if (status) params.set('status', status)
  const query = useQuery({
    queryKey: ['payment-methods', params.toString()],
    queryFn: ({ signal }) =>
      api<CatalogPage<PaymentMethod>>(`payment-methods?${params}`, { signal }),
  })
  return (
    <>
      <Link className="text-button product-back" to="/ventas">
        <ArrowLeft size={16} />
        Volver a ventas
      </Link>
      <PageTitle
        eyebrow="CADA MÉTODO, UN REGISTRO CLARO"
        title="Métodos de pago"
        description="Configura los métodos registrados por tu equipo. Los nombres y tipos se conservan en cada pago."
        action={
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={17} />
            Nuevo método
          </button>
        }
      />
      <div className="operation-toolbar">
        <select
          className="order-state-filter"
          aria-label="Estado de métodos de pago"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <span className="muted">Registros manuales · Sin conexión a pasarelas</span>
      </div>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <section className="panel sales-list-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((method) => (
                  <tr key={method.id}>
                    <td>
                      <strong>{method.name}</strong>
                      <small className="sale-order-id">{method.code}</small>
                    </td>
                    <td>{method.kind === 'cash' ? 'Efectivo' : 'No efectivo · Manual'}</td>
                    <td>
                      <span className={`pill ${method.is_active ? 'green' : 'neutral'}`}>
                        {method.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        aria-label={`Editar método ${method.name}`}
                        onClick={() => setEditing(method)}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && (
            <p className="empty-inline muted">No hay métodos con este estado.</p>
          )}
          <Pagination meta={query.data.meta} onPage={setPage} pending={query.isFetching} />
        </section>
      )}
      {editing && (
        <PaymentMethodEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function PaymentMethodEditor({
  initial,
  onClose,
}: {
  initial: PaymentMethod | null
  onClose: () => void
}) {
  const [revision] = useState(initial?.revision)
  const [kind, setKind] = useState(initial?.kind ?? 'non_cash')
  const [active, setActive] = useState(initial?.is_active ?? true)
  const client = useQueryClient()
  const toast = useToast()
  async function saved() {
    await client.invalidateQueries({ queryKey: ['payment-methods'] })
    toast(initial ? 'Método actualizado.' : 'Método de pago creado.')
    onClose()
  }
  const create = useOperation<PaymentMethod>('payment-methods', saved)
  const update = useMutation({
    mutationFn: (body: unknown) => api(`payment-methods/${initial?.id}`, { method: 'PUT', body }),
    onSuccess: saved,
  })
  const pending = initial ? update.isPending : create.isPending
  const locked = initial ? update.isPending : create.locked
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const body = { name: fields.get('name'), is_active: active }
    if (initial) update.mutate({ ...body, revision })
    else create.send({ ...body, code: fields.get('code'), kind })
  }
  return (
    <Modal
      title={initial ? `Editar método · ${initial.name}` : 'Nuevo método de pago'}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={initial ? update.error : create.error} />
        <OperationNotice uncertain={!initial && create.uncertain} />
        <fieldset disabled={locked} className="form-stack">
          <Field label="Nombre del método">
            <input name="name" defaultValue={initial?.name} required maxLength={60} autoFocus />
          </Field>
          {!initial ? (
            <>
              <Field label="Código del método">
                <input
                  name="code"
                  required
                  minLength={2}
                  maxLength={20}
                  pattern="[A-Za-z0-9_-]+"
                  placeholder="transferencia"
                />
              </Field>
              <Field label="Tipo de método">
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as PaymentMethod['kind'])}
                >
                  <option value="non_cash">No efectivo · Registro manual</option>
                  <option value="cash">Efectivo</option>
                </select>
              </Field>
            </>
          ) : (
            <p className="muted small">
              Código {initial.code} · {initial.kind === 'cash' ? 'Efectivo' : 'No efectivo manual'}.
              Código y tipo se conservan.
            </p>
          )}
          <p className="muted small">
            {kind === 'cash'
              ? 'Registra ingreso o salida de efectivo en caja.'
              : 'Exige referencia y no modifica el efectivo de caja. El operador declara el pago; no hay confirmación de banco o pasarela.'}
          </p>
          <label className="check-line">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={initial?.is_system}
            />
            Disponible para nuevos cobros
          </label>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          <Submit pending={pending}>
            {!initial && create.uncertain ? 'Reintentar envío' : 'Guardar método'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}
