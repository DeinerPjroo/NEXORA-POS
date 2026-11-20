import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, PageTitle } from '../../components/ui'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { ComboProductPicker } from '../catalog/ComboProductPicker'
import type { Product, CatalogPage } from '../catalog/types'
import { Pagination } from '../catalog/catalog-ui'
type Station = { id: number; name: string }
type Route = {
  id: number
  is_active: boolean
  station: Station
  product: { id: number; name: string; revision: number }
  kitchen_station_id: number
}
export function KitchenRoutesPage() {
  const context = useOperationContext()
  const [branch, setBranch] = useState('')
  const branchId = branch || String(context.data?.branches.find((b) => b.is_active)?.id ?? '')
  const [page, setPage] = useState(1)
  const [pick, setPick] = useState(false)
  const [edit, setEdit] = useState<{
    product: Route['product']
    station?: number
    active: boolean
    branch: string
  } | null>(null)
  const routes = useQuery({
    queryKey: ['kitchen-routes', branchId, page],
    enabled: !!branchId,
    queryFn: () => api<CatalogPage<Route>>(`kitchen-routes?branch_id=${branchId}&page=${page}`),
  })
  return (
    <>
      <PageTitle
        eyebrow="NEXORA KITCHEN · CONFIGURACIÓN"
        title="Rutas de preparación"
        description="Asigna cada producto individual a una estación. Los combos se preparan por sus componentes."
        action={
          <Link className="button secondary" to="/cocina/estaciones">
            Estaciones
          </Link>
        }
      />
      <div className="operation-toolbar">
        <select
          aria-label="Sucursal de rutas"
          value={branchId}
          onChange={(event) => {
            setBranch(event.target.value)
            setPage(1)
          }}
        >
          {context.data?.branches
            .filter((b) => b.is_active)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <button className="button primary" disabled={!branchId} onClick={() => setPick(true)}>
          Asignar producto
        </button>
        <Link to="/terminal/cocina">Abrir cocina</Link>
      </div>
      <ErrorNotice error={context.error || routes.error} />
      {routes.isPending ? (
        <Loading />
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Estación</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {routes.data?.data.map((route) => (
                <tr key={route.id}>
                  <td>{route.product.name}</td>
                  <td>{route.station.name}</td>
                  <td>{route.is_active ? 'Activa' : 'Archivada'}</td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setEdit({
                          product: route.product,
                          station: route.kitchen_station_id,
                          active: route.is_active,
                          branch: branchId,
                        })
                      }
                    >
                      Editar ruta {route.product.name}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!routes.data?.data.length && <p>No hay rutas configuradas para esta sucursal.</p>}
          {routes.data && (
            <Pagination meta={routes.data.meta} pending={routes.isFetching} onPage={setPage} />
          )}
        </div>
      )}
      {pick && (
        <ComboProductPicker
          title="Elegir producto para cocina"
          onClose={() => setPick(false)}
          onPick={(product: Product) => {
            setPick(false)
            setEdit({ product, active: true, branch: branchId })
          }}
        />
      )}
      {edit && (
        <RouteEditor
          key={`${edit.branch}:${edit.product.id}`}
          value={edit}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  )
}
function RouteEditor({
  value,
  onClose,
}: {
  value: { product: Route['product']; station?: number; active: boolean; branch: string }
  onClose: () => void
}) {
  const [snapshot] = useState(value)
  const [station, setStation] = useState(String(value.station ?? ''))
  const [active, setActive] = useState(value.active)
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const stations = useQuery({
    queryKey: ['kitchen-stations', 'routing', snapshot.branch, page],
    queryFn: () =>
      api<CatalogPage<Station>>(
        `kitchen-stations?branch_id=${snapshot.branch}&status=active&per_page=50&page=${page}`,
      ),
  })
  const operation = useOperation('kitchen-routes', async () => {
    await Promise.all(
      ['kitchen-routes', 'products'].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
    onClose()
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    operation.send({
      branch_id: Number(snapshot.branch),
      product_id: snapshot.product.id,
      product_revision: snapshot.product.revision,
      kitchen_station_id: Number(station),
      is_active: active,
    })
  }
  return (
    <Modal
      title={`Preparación · ${snapshot.product.name}`}
      onClose={() => {
        if (!operation.locked) onClose()
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error || stations.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked} className="form-stack">
          <Field label="Estación de preparación">
            <select value={station} required onChange={(event) => setStation(event.target.value)}>
              <option value="">Selecciona una estación</option>
              {stations.data?.data.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {stations.data && (
            <Pagination meta={stations.data.meta} pending={stations.isFetching} onPage={setPage} />
          )}
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Ruta activa
          </label>
        </fieldset>
        <button
          className="button primary"
          disabled={operation.isPending || (!operation.uncertain && !station)}
        >
          {operation.uncertain ? 'Reintentar misma ruta' : 'Guardar ruta'}
        </button>
      </form>
    </Modal>
  )
}
