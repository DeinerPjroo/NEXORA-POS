import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LockKeyhole, Pencil, Plus, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import type { Permission, Role } from '../../lib/types'
import {
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageTitle,
  Submit,
  useToast,
} from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'

export function RolesPage() {
  const [editing, setEditing] = useState<Role | 'new' | null>(null)
  const can = useCan()
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<{ roles: Role[]; permissions: Permission[] }>('roles'),
  })
  return (
    <>
      <PageTitle
        eyebrow="CONFIANZA CON CONTROL"
        title="Roles y permisos"
        description="Define responsabilidades y protege cada parte de tu negocio."
        action={
          can('roles.manage') && (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              Crear rol
            </button>
          )
        }
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <div className="roles-grid">
          {query.data?.roles.map((role) => (
            <article
              className={`panel role-card ${role.is_owner ? 'owner-role' : ''}`}
              key={role.id}
            >
              <div className="role-card-heading">
                <span className={`metric-icon ${role.is_owner ? 'violet' : 'cyan'}`}>
                  <ShieldCheck size={22} />
                </span>
                {role.is_owner ? (
                  <span className="pill violet">
                    <LockKeyhole size={12} />
                    Protegido
                  </span>
                ) : (
                  can('roles.manage') &&
                  role.id !== session!.role.id && (
                    <button
                      className="icon-button"
                      aria-label={`Editar rol ${role.name}`}
                      onClick={() => setEditing(role)}
                    >
                      <Pencil size={17} />
                    </button>
                  )
                )}
              </div>
              <h2>{role.name}</h2>
              <p>{role.permissions.length} permisos habilitados</p>
              <div className="role-permissions">
                {role.permissions.slice(0, 3).map((permission) => (
                  <span key={permission.key}>{permission.name}</span>
                ))}
                {role.permissions.length > 3 && (
                  <span className="extra-permissions">+{role.permissions.length - 3} más</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && query.data && (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          permissions={query.data.permissions}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="info-strip">
        <LockKeyhole size={20} />
        <div>
          <h3>Permisos que también se cumplen en el servidor.</h3>
          <p>
            El rol propietario está protegido. Solo puedes conceder permisos que tu propia cuenta
            tenga habilitados.
          </p>
        </div>
      </div>
    </>
  )
}

function RoleEditor({
  role,
  permissions,
  onClose,
}: {
  role: Role | null
  permissions: Permission[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState(
    role?.permissions.map((permission) => permission.key) ?? ['dashboard.view'],
  )
  const can = useCan()
  const client = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`roles${role ? `/${role.id}` : ''}`, { method: role ? 'PUT' : 'POST', body }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['roles'] }),
        client.invalidateQueries({ queryKey: ['overview'] }),
      ])
      toast('Rol guardado correctamente.')
      onClose()
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutation.mutate({
      name: new FormData(event.currentTarget).get('name'),
      permissions: selected,
      ...(role ? { revision: role.revision } : {}),
    })
  }
  return (
    <Modal title={role ? `Editar rol: ${role.name}` : 'Crea un rol a tu medida'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={mutation.error} />
        <Field label="Nombre del rol">
          <input
            name="name"
            defaultValue={role?.name}
            required
            maxLength={80}
            placeholder="Ej. Encargado de sede"
            autoFocus
          />
        </Field>
        <div className="permission-groups">
          {Array.from(new Set(permissions.map((permission) => permission.group))).map((group) => (
            <fieldset key={group}>
              <legend>{group}</legend>
              {permissions
                .filter((permission) => permission.group === group)
                .map((permission) => (
                  <label className="checkbox-line" key={permission.key}>
                    <input
                      type="checkbox"
                      checked={selected.includes(permission.key)}
                      disabled={!can(permission.key)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, permission.key]
                            : selected.filter((key) => key !== permission.key),
                        )
                      }
                    />
                    <span>{permission.name}</span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <Submit pending={mutation.isPending}>Guardar rol</Submit>
        </div>
      </form>
    </Modal>
  )
}
