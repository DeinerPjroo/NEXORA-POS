import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ShieldCheck, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorNotice, Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'

type Member = {
  id: number
  name: string
  email: string
  is_active: boolean
  role: { name: string }
  created_at: string
}
export function TeamPage() {
  const can = useCan()
  const { session } = useSession()
  const query = useQuery({ queryKey: ['team'], queryFn: () => api<Member[]>('workspace/team') })
  return (
    <>
      <PageTitle
        eyebrow="LAS PERSONAS DETRÁS DE TU NEGOCIO"
        title="Mi equipo"
        description="Conoce quién forma parte de tu espacio de trabajo."
        action={
          can('roles.view') && (
            <Link className="button secondary" to="/roles">
              <ShieldCheck size={17} />
              Roles y permisos
              <ArrowUpRight size={15} />
            </Link>
          )
        }
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>Personas registradas</h2>
            <span className="pill neutral">
              <Users size={14} />
              {query.data?.length ?? 0} personas
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Fecha de registro</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-cell">
                        <span className="avatar">{member.name[0].toUpperCase()}</span>
                        <span>
                          <strong>
                            {member.name}
                            {member.id === session!.user.id && (
                              <small className="you-tag"> Tú</small>
                            )}
                          </strong>
                          <small>{member.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>{member.role.name}</td>
                    <td>
                      <span className={`pill ${member.is_active ? 'green' : 'neutral'}`}>
                        {member.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      {new Intl.DateTimeFormat('es-CO', {
                        dateStyle: 'medium',
                        timeZone: session!.company.timezone,
                      }).format(new Date(member.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="info-strip">
        <ShieldCheck size={20} />
        <div>
          <h3>Cada persona, con el acceso que necesita.</h3>
          <p>
            Puedes preparar roles personalizados ahora. La incorporación de empleados, turnos y
            asistencia llegará en la Fase 3.
          </p>
        </div>
      </div>
    </>
  )
}
