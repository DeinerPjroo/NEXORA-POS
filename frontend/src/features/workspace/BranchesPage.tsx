import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPin, Pencil, Phone, Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import type { Branch } from '../../lib/types'
import {
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageTitle,
  Submit,
  useToast,
} from '../../components/ui'
import { useCan } from '../auth/SessionProvider'

export function BranchesPage() {
  const can = useCan()
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey: ['branches'], queryFn: () => api<Branch[]>('branches') })
  const list =
    query.data?.filter((branch) =>
      `${branch.name} ${branch.code} ${branch.city}`
        .toLocaleLowerCase('es')
        .includes(search.toLocaleLowerCase('es')),
    ) ?? []
  return (
    <>
      <PageTitle
        eyebrow="UN NEGOCIO, MUCHOS LUGARES"
        title="Tus sucursales"
        description="Cada sede tiene su lugar. Adminístralas desde un solo espacio."
        action={
          can('branches.manage') && (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              Nueva sucursal
            </button>
          )
        }
      />
      <div className="toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Buscar sucursales"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, código o ciudad…"
          />
        </div>
        <span className="muted">{query.data?.length ?? 0} sucursales registradas</span>
      </div>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div className="branch-grid">
          {list.map((branch) => (
            <article className="panel branch-card" key={branch.id}>
              <div className="branch-card-top">
                <span className="branch-symbol">
                  <Building2 size={25} />
                </span>
                <span className={`pill ${branch.is_active ? 'green' : 'neutral'}`}>
                  {branch.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <span className="branch-code">{branch.code}</span>
              <h2>{branch.name}</h2>
              <p>
                <MapPin size={16} />
                {[branch.address, branch.city].filter(Boolean).join(', ') ||
                  'Ubicación pendiente de completar'}
              </p>
              <p>
                <Phone size={16} />
                {branch.phone || 'Sin teléfono registrado'}
              </p>
              <div className="branch-card-footer">
                <span>Espacio independiente por sede</span>
                {can('branches.manage') && (
                  <button
                    className="text-button"
                    onClick={() => setEditing(branch)}
                    aria-label={`Editar ${branch.name}`}
                  >
                    <Pencil size={15} />
                    Editar
                  </button>
                )}
              </div>
            </article>
          ))}
          {!list.length && (
            <div className="empty-state">
              <Building2 size={32} />
              <h2>No encontramos sucursales</h2>
              <p>Prueba con otro nombre o registra una nueva sede.</p>
            </div>
          )}
        </div>
      )}
      {editing && (
        <BranchEditor
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function BranchEditor({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const client = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`branches${branch ? `/${branch.id}` : ''}`, { method: branch ? 'PUT' : 'POST', body }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['branches'] }),
        client.invalidateQueries({ queryKey: ['overview'] }),
      ])
      toast(branch ? 'Sucursal actualizada.' : 'Nueva sucursal creada.')
      onClose()
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    mutation.mutate({ ...Object.fromEntries(data), is_active: data.get('is_active') === 'on' })
  }
  return (
    <Modal title={branch ? 'Editar sucursal' : 'Un nuevo lugar para crecer'} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">Los datos de esta sucursal pertenecen únicamente a tu empresa.</p>
        <ErrorNotice error={mutation.error} />
        <Field label="Nombre de la sucursal">
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={branch?.name}
            autoFocus
            placeholder="Ej. Sede Chapinero"
          />
        </Field>
        <div className="form-grid">
          <Field label="Código interno" hint="Letras, números, guiones. Sin espacios.">
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9_-]+"
              defaultValue={branch?.code}
              placeholder="CHAPINERO"
            />
          </Field>
          <Field label="Ciudad">
            <input
              name="city"
              maxLength={80}
              defaultValue={branch?.city ?? ''}
              placeholder="Bogotá"
            />
          </Field>
        </div>
        <Field label="Dirección">
          <input
            name="address"
            maxLength={200}
            defaultValue={branch?.address ?? ''}
            placeholder="Calle, número y local"
          />
        </Field>
        <Field label="Teléfono">
          <input name="phone" type="tel" maxLength={30} defaultValue={branch?.phone ?? ''} />
        </Field>
        <label className="checkbox-line">
          <input name="is_active" type="checkbox" defaultChecked={branch?.is_active ?? true} />
          <span>Sucursal activa</span>
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <Submit pending={mutation.isPending} />
        </div>
      </form>
    </Modal>
  )
}
