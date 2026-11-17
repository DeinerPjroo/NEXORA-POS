import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Plus, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/money'
import { Loading, PageTitle } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { CatalogError, Pagination } from '../catalog/catalog-ui'
import type { CatalogPage } from '../catalog/types'
import { OperationalBranchPicker, useOperationContext } from '../operations/OperationalBranchPicker'
import type { CashRegister, CashSession } from '../operations/types'
import { CashCommandModal } from './CashCommandModal'

export function CashPage() {
  const context = useOperationContext()
  const [branch, setBranch] = useState<number | null>(null)
  const [registerPage, setRegisterPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [opening, setOpening] = useState<CashRegister | null>(null)
  const [creating, setCreating] = useState(false)
  const can = useCan()
  const { session } = useSession()
  const selected =
    branch ??
    context.data?.branches.find((item) => item.is_active)?.id ??
    context.data?.branches[0]?.id ??
    null
  const active = context.data?.branches.find((item) => item.id === selected)?.is_active
  const registers = useQuery({
    queryKey: ['cash-registers', selected, registerPage],
    queryFn: ({ signal }) =>
      api<CatalogPage<CashRegister>>(
        `cash/registers?branch_id=${selected}&page=${registerPage}&per_page=9`,
        { signal },
      ),
    enabled: selected !== null,
  })
  const history = useQuery({
    queryKey: ['cash-sessions', selected, historyPage],
    queryFn: ({ signal }) =>
      api<CatalogPage<CashSession>>(
        `cash/sessions?branch_id=${selected}&page=${historyPage}&per_page=10`,
        { signal },
      ),
    enabled: selected !== null,
  })
  return (
    <>
      <PageTitle
        eyebrow="CADA MOVIMIENTO, EN SU LUGAR"
        title="Caja"
        description="Apertura, efectivo y cierre. Una historia clara de cada jornada."
        action={
          can('cash.manage') && (
            <button className="button primary" disabled={!active} onClick={() => setCreating(true)}>
              <Plus size={17} />
              Nueva caja
            </button>
          )
        }
      />
      <div className="operation-toolbar">
        <OperationalBranchPicker
          branches={context.data?.branches ?? []}
          value={selected}
          onChange={(id) => {
            setBranch(id)
            setRegisterPage(1)
            setHistoryPage(1)
          }}
        />
        <span className="muted">Los pedidos aún no generan ingresos en caja.</span>
      </div>
      {context.error ? (
        <CatalogError error={context.error} onRetry={() => void context.refetch()} />
      ) : context.isPending || registers.isPending ? (
        <Loading />
      ) : registers.error ? (
        <CatalogError error={registers.error} onRetry={() => void registers.refetch()} />
      ) : (
        <>
          <div className="cash-register-grid">
            {registers.data.data.map((register) => (
              <section className="panel cash-register-card" key={register.id}>
                <div className="panel-heading">
                  <span className="metric-icon cyan">
                    <Wallet size={23} />
                  </span>
                  <span className={`pill ${register.current_session ? 'green' : 'neutral'}`}>
                    {register.current_session ? 'Abierta' : 'Sin sesión abierta'}
                  </span>
                </div>
                <small>{register.code}</small>
                <h2>{register.name}</h2>
                <p className="muted">
                  {register.current_session ? 'Efectivo esperado' : 'Lista para una nueva jornada'}
                </p>
                {register.current_session && (
                  <strong className="cash-balance">
                    {formatMoney(
                      register.current_session.expected_amount,
                      register.current_session.currency,
                    )}
                  </strong>
                )}
                <div className="cash-card-actions">
                  {register.current_session ? (
                    <Link
                      className="button secondary"
                      to={`/caja/sesiones/${register.current_session.id}`}
                    >
                      Ver sesión
                      <ArrowUpRight size={15} />
                    </Link>
                  ) : (
                    can('cash.manage') && (
                      <button
                        className="button primary"
                        disabled={!active || !register.is_active}
                        onClick={() => setOpening(register)}
                      >
                        Abrir caja
                        <ArrowUpRight size={15} />
                      </button>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>
          <Pagination
            meta={registers.data.meta}
            onPage={setRegisterPage}
            pending={registers.isFetching}
          />
        </>
      )}
      <section className="panel cash-history">
        <div className="panel-heading">
          <h2>Historial de sesiones</h2>
          <span className="pill neutral">Registros conservados</span>
        </div>
        {history.error ? (
          <CatalogError error={history.error} onRetry={() => void history.refetch()} />
        ) : (
          history.data && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Caja</th>
                      <th>Estado</th>
                      <th>Apertura</th>
                      <th>Efectivo esperado</th>
                      <th>Diferencia</th>
                      <th>
                        <span className="sr-only">Ver sesión</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.data.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.register_name}
                          <small className="table-secondary">
                            {new Intl.DateTimeFormat('es-CO', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                              timeZone: session!.company.timezone,
                            }).format(new Date(item.opened_at))}
                          </small>
                        </td>
                        <td>
                          <span className={`pill ${item.status === 'open' ? 'green' : 'neutral'}`}>
                            {item.status === 'open' ? 'Abierta' : 'Cerrada'}
                          </span>
                        </td>
                        <td>{formatMoney(item.opening_amount, item.currency)}</td>
                        <td>{formatMoney(item.expected_amount, item.currency)}</td>
                        <td>
                          {item.difference !== null
                            ? formatMoney(item.difference, item.currency)
                            : '—'}
                        </td>
                        <td>
                          <Link
                            className="icon-button"
                            to={`/caja/sesiones/${item.id}`}
                            aria-label={`Ver sesión ${item.id}`}
                          >
                            <ArrowUpRight size={17} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!history.data.data.length && (
                <p className="empty-inline muted">
                  Las aperturas y cierres de esta sucursal aparecerán aquí.
                </p>
              )}
              <Pagination
                meta={history.data.meta}
                onPage={setHistoryPage}
                pending={history.isFetching}
              />
            </>
          )
        )}
      </section>
      {opening && (
        <CashCommandModal mode="open" register={opening} onClose={() => setOpening(null)} />
      )}
      {creating && (
        <CashCommandModal mode="register" branchId={selected!} onClose={() => setCreating(false)} />
      )}
    </>
  )
}
