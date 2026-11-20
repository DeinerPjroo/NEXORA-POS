import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { KeyRound, Pencil, Plus, ShieldCheck, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, PageTitle, Submit } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import type { Role } from '../../lib/types'

type Member = {
  id: number
  name: string
  email: string
  is_active: boolean
  employee_revision: number
  all_branches: boolean
  role: { id: number; name: string; is_owner: boolean }
  branches: { id: number; name: string }[]
  pin_enabled: boolean
  can_manage: boolean
  can_credentials: boolean
}
type Options = { roles: Role[]; branches: { id: number; name: string }[] }

export function TeamPage() {
  const can = useCan()
  const { session } = useSession()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const [security, setSecurity] = useState<Member | null>(null)
  const query = useQuery({ queryKey: ['team'], queryFn: () => api<Member[]>('workspace/team') })
  const options = useQuery({
    queryKey: ['employee-options'],
    queryFn: () => api<Options>('employees/options'),
    enabled: can('team.manage'),
  })
  const list = query.data?.filter((m) =>
    `${m.name} ${m.email} ${m.role.name}`
      .toLocaleLowerCase('es')
      .includes(search.toLocaleLowerCase('es')),
  )
  return (
    <>
      <PageTitle
        eyebrow="PERSONAS Y ACCESOS"
        title="Empleados y usuarios"
        description="Cuentas individuales, roles y sucursales autorizadas."
        action={
          <div className="form-actions">
            {can('roles.view') && (
              <Link className="button secondary" to="/roles">
                <ShieldCheck size={17} />
                Roles y permisos
              </Link>
            )}
            {can('team.manage') && (
              <button className="button primary" onClick={() => setEditing('new')}>
                <Plus size={17} />
                Nuevo empleado
              </button>
            )}
          </div>
        }
      />
      <div className="toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Buscar empleados"
            placeholder="Nombre, correo o rol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">{list?.length ?? 0} empleados</span>
      </div>
      <ErrorNotice error={query.error || options.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Rol</th>
                  <th>Sucursales</th>
                  <th>Acceso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>
                        {m.name}
                        {m.id === session?.user.id ? ' · Tú' : ''}
                      </strong>
                      <small style={{ display: 'block' }}>{m.email}</small>
                    </td>
                    <td>{m.role.name}</td>
                    <td>
                      {m.all_branches
                        ? 'Todas las sucursales'
                        : m.branches.map((b) => b.name).join(', ') || 'Sin sucursales'}
                    </td>
                    <td>
                      <span className={`pill ${m.is_active ? 'green' : 'neutral'}`}>
                        {m.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      <small style={{ display: 'block' }}>
                        PIN {m.pin_enabled ? 'configurado' : 'sin configurar'}
                      </small>
                    </td>
                    <td>
                      {!m.role.is_owner && m.id !== session?.user.id && (
                        <div className="form-actions">
                          {m.can_manage && (
                            <button
                              className="button secondary"
                              aria-label={`Editar ${m.name}`}
                              onClick={() => setEditing(structuredClone(m))}
                            >
                              <Pencil size={15} />
                              Editar
                            </button>
                          )}
                          {m.can_credentials && (
                            <button
                              className="button secondary"
                              aria-label={`Accesos de ${m.name}`}
                              onClick={() => setSecurity(structuredClone(m))}
                            >
                              <KeyRound size={15} />
                              Accesos
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list?.length && <p className="muted">No hay empleados que coincidan.</p>}
        </section>
      )}
      <div className="info-strip">
        <ShieldCheck size={20} />
        <div>
          <h3>Acceso personal y trazable</h3>
          <p>
            El PIN desbloquea la sesión individual de Terminal después de iniciar sesión. Los
            cambios de acceso revocan las sesiones del empleado.
          </p>
        </div>
      </div>
      {editing &&
        (options.isPending ? (
          <Loading />
        ) : (
          options.data && (
            <EmployeeEditor
              member={editing === 'new' ? null : editing}
              options={options.data}
              onClose={() => setEditing(null)}
            />
          )
        ))}
      {security && <EmployeeSecurity member={security} onClose={() => setSecurity(null)} />}
    </>
  )
}

function useEmployeeOperation(path: string, close: () => void, method: 'POST' | 'PUT' = 'POST') {
  const client = useQueryClient()
  return useOperation<Member>(
    path,
    async () => {
      await Promise.all(
        ['team', 'overview', 'employee-options', 'dining-waiters'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      close()
    },
    method,
  )
}

function EmployeeEditor({
  member,
  options,
  onClose,
}: {
  member: Member | null
  options: Options
  onClose: () => void
}) {
  const [branches, setBranches] = useState(member?.branches.map((b) => b.id) ?? [])
  const operation = useEmployeeOperation(
    `employees${member ? `/${member.id}` : ''}`,
    onClose,
    member ? 'PUT' : 'POST',
  )
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    operation.send({
      name: form.get('name'),
      email: form.get('email'),
      role_id: Number(form.get('role_id')),
      is_active: form.get('is_active') === 'on',
      branch_ids: branches,
      ...(member
        ? { revision: member.employee_revision }
        : {
            password: form.get('password'),
            password_confirmation: form.get('password_confirmation'),
            pin: form.get('pin') || null,
          }),
    })
  }
  return (
    <Modal
      title={member ? `Editar empleado: ${member.name}` : 'Nuevo empleado'}
      locked={operation.locked}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Nombre del empleado">
            <input name="name" defaultValue={member?.name} required maxLength={100} />
          </Field>
          <Field label="Correo de acceso">
            <input
              name="email"
              type="email"
              defaultValue={member?.email}
              autoComplete="off"
              required
              maxLength={190}
            />
          </Field>
          <Field label="Rol del empleado">
            <select name="role_id" defaultValue={member?.role.id ?? ''} required>
              <option value="" disabled>
                Selecciona un rol
              </option>
              {options.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend>Sucursales autorizadas</legend>
            {options.branches.map((b) => (
              <label className="checkbox-line" key={b.id}>
                <input
                  type="checkbox"
                  checked={branches.includes(b.id)}
                  onChange={(e) =>
                    setBranches(
                      e.target.checked ? [...branches, b.id] : branches.filter((id) => id !== b.id),
                    )
                  }
                />
                {b.name}
              </label>
            ))}
          </fieldset>
          <label className="checkbox-line">
            <input name="is_active" type="checkbox" defaultChecked={member?.is_active ?? true} />
            Empleado activo
          </label>
          {!member && (
            <>
              <Field label="Contraseña inicial">
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </Field>
              <Field label="Confirmar contraseña">
                <input
                  name="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </Field>
              <Field label="PIN personal (opcional)">
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                />
              </Field>
              <p className="muted">
                Contraseña: mínimo 12 caracteres con mayúsculas, minúsculas y números. PIN: 6
                dígitos.
              </p>
            </>
          )}
        </fieldset>
        <div className="form-actions">
          <button
            className="button secondary"
            type="button"
            disabled={operation.locked}
            onClick={onClose}
          >
            Cancelar
          </button>
          {operation.uncertain ? (
            <button className="button primary" type="button" onClick={() => operation.send({})}>
              Reintentar mismo guardado
            </button>
          ) : (
            <Submit pending={operation.isPending} disabled={!branches.length}>
              Guardar empleado
            </Submit>
          )}
        </div>
      </form>
    </Modal>
  )
}

function EmployeeSecurity({ member, onClose }: { member: Member; onClose: () => void }) {
  const [action, setAction] = useState('revoke')
  const operation = useEmployeeOperation(`employees/${member.id}/security`, onClose)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    operation.send({
      revision: member.employee_revision,
      action,
      clear_pin: form.get('clear_pin') === 'on',
      ...(action === 'password'
        ? {
            password: form.get('password'),
            password_confirmation: form.get('password_confirmation'),
          }
        : {}),
    })
  }
  return (
    <Modal title={`Accesos de ${member.name}`} locked={operation.locked} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Acción de seguridad">
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="revoke">Cerrar todas sus sesiones</option>
              <option value="password">Restablecer contraseña y cerrar sesiones</option>
            </select>
          </Field>
          {action === 'password' && (
            <>
              <Field label="Nueva contraseña">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirmar nueva contraseña">
                <input
                  name="password_confirmation"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
          <label className="checkbox-line">
            <input name="clear_pin" type="checkbox" />
            Quitar PIN personal
          </label>
          <p className="muted">
            El empleado deberá iniciar sesión de nuevo. Su protección MFA se conserva.
          </p>
        </fieldset>
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={operation.locked}
            onClick={onClose}
          >
            Cancelar
          </button>
          {operation.uncertain ? (
            <button type="button" className="button primary" onClick={() => operation.send({})}>
              Reintentar mismo cambio
            </button>
          ) : (
            <Submit pending={operation.isPending}>Confirmar cambio de acceso</Submit>
          )}
        </div>
      </form>
    </Modal>
  )
}
