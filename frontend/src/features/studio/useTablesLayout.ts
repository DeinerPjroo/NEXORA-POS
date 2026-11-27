import { defaultTablesLayout, parseTablesLayout, type TablesLayout } from './tables-layout'
import { usePublishedOperationalLayout } from './usePublishedOperationalLayout'

export function useTablesLayout(enabled: boolean, frozen: boolean, preview?: TablesLayout) {
  return usePublishedOperationalLayout(
    'tables',
    'dining.view',
    parseTablesLayout,
    defaultTablesLayout,
    enabled,
    frozen,
    preview,
  )
}
