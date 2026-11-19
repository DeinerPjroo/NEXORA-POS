import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { OperationContext, OperationalBranch } from './types'

export function useOperationContext(refreshOnMount = false) {
  return useQuery({
    queryKey: ['operation-context'],
    queryFn: ({ signal }) => api<OperationContext>('operations/context', { signal }),
    refetchOnMount: refreshOnMount ? 'always' : true,
  })
}
export function OperationalBranchPicker({
  branches,
  value,
  onChange,
  disabled = false,
}: {
  branches: OperationalBranch[]
  value: number | null
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="operational-branch">
      <Building2 size={17} />
      <select
        aria-label="Sucursal de operación"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {(!branches.length || value === null) && (
          <option value="" disabled>
            {branches.length ? 'Elige una sucursal' : 'Sin sucursales disponibles'}
          </option>
        )}
        {branches.map((branch) => (
          <option value={branch.id} key={branch.id}>
            {branch.name}
            {branch.is_active ? '' : ' · Inactiva'}
          </option>
        ))}
      </select>
    </div>
  )
}
