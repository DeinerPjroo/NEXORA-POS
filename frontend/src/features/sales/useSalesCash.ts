import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { CashOption } from './types'

// Una revisión operativa nueva por formulario; nunca reutilizar la de un pago anterior.
export function useSalesCash(branchId: number) {
  const [formKey] = useState(() => crypto.randomUUID())
  return useQuery({
    queryKey: ['sales-cash', branchId, formKey],
    queryFn: () => api<{ data: CashOption[] }>(`sales/cash-context?branch_id=${branchId}`),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
