import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui'
import { useOperation } from '../operations/useOperation'

export function useModifierWrite<T>(path: string, editing: boolean, onClose: () => void) {
  const client = useQueryClient()
  const toast = useToast()
  const refresh = () =>
    Promise.all(
      ['product', 'products', 'modifier-groups', 'modifier-options', 'modifier-configuration'].map(
        (key) => client.invalidateQueries({ queryKey: [key] }),
      ),
    )
  const operation = useOperation<T>(
    path,
    async () => {
      await refresh()
      toast('Modificadores guardados.')
      onClose()
    },
    editing ? 'PUT' : 'POST',
  )
  return { ...operation, refresh }
}
