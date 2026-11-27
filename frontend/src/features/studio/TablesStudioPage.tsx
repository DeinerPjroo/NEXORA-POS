import { lazy, Suspense } from 'react'
import { Loading } from '../../components/ui'
import { OperationalStudioPage, type SurfaceDefinition } from './OperationalStudioPage'
import {
  compactTablesLayout,
  defaultTablesLayout,
  parseTablesLayout,
  tableBounds,
  type TablesLayout,
} from './tables-layout'
const TerminalTablesPage = lazy(() =>
  import('../dining/TerminalTablesPage').then((module) => ({ default: module.TerminalTablesPage })),
)
const labels = {
  card_width: 'Ancho de mesa',
  card_height: 'Alto de mesa',
  gap: 'Espacio entre mesas',
  radius: 'Esquinas',
  font_size: 'Tamaño del nombre',
}
const definition: SurfaceDefinition<TablesLayout> = {
  surface: 'tables',
  title: 'Diseña Mesas y salones',
  eyebrow: 'NEXORA STUDIO / MESAS',
  description:
    'Diseño general de tarjetas operativas. El plano físico y la ocupación conservan sus datos y permisos.',
  editorName: 'Editor de Mesas',
  previewName: 'Vista previa real de Mesas',
  propertiesName: 'Tarjetas de mesas',
  permission: 'dining.view',
  help: 'El nombre y el estado real siempre permanecen visibles.',
  defaults: defaultTablesLayout,
  parse: parseTablesLayout,
  numbers: Object.fromEntries(
    Object.entries(tableBounds).map(([key, [min, max]]) => [
      key,
      { label: labels[key as keyof typeof labels], min, max },
    ]),
  ),
  colors: { available: 'Color libre', occupied: 'Color ocupada', paid: 'Color pagada y ocupada' },
  flags: { capacity: 'Mostrar personas / capacidad', symbol: 'Mostrar símbolo de mesa' },
  presets: [
    { name: 'Original', configuration: defaultTablesLayout },
    { name: 'Mesas Compactas', configuration: compactTablesLayout },
  ],
  render: (config) => (
    <Suspense fallback={<Loading />}>
      <TerminalTablesPage studioPreview={config} />
    </Suspense>
  ),
}
export function TablesStudioPage() {
  return <OperationalStudioPage definition={definition} />
}
