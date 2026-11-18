import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui'
import { useOperation } from '../operations/useOperation'

export function useAvailabilityWrite<T>(path: string, editing: boolean, onClose: () => void) {
  const client = useQueryClient()
  const toast = useToast()
  const refresh = () =>
    Promise.all(
      [
        'product',
        'products',
        'variants',
        'availability-windows',
        'modifier-configuration',
        'context-prices',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    )
  const operation = useOperation<T>(
    path,
    async () => {
      await refresh()
      toast('Horario de disponibilidad guardado.')
      onClose()
    },
    editing ? 'PUT' : 'POST',
  )
  return { ...operation, refresh }
}
