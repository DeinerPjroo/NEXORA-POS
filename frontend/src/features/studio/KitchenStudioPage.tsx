import { KitchenBoardPage } from '../kitchen/KitchenBoardPage'
import { OperationalStudioPage, type SurfaceDefinition } from './OperationalStudioPage'
import {
  compactKitchenLayout,
  defaultKitchenLayout,
  kitchenBounds,
  parseKitchenLayout,
  type KitchenLayout,
} from './kitchen-layout'
const labels = {
  column_width: 'Ancho mínimo de columna',
  font_size: 'Tamaño de productos',
  padding: 'Espacio interno de comanda',
  gap: 'Separación de columnas',
  radius: 'Esquinas de comanda',
}
const definition: SurfaceDefinition<KitchenLayout> = {
  surface: 'kitchen',
  title: 'Diseña Nexora Kitchen',
  eyebrow: 'NEXORA STUDIO / KITCHEN',
  description:
    'Personaliza la presentación del tablero real, conservando estaciones, estados y comandas.',
  editorName: 'Editor de Kitchen',
  previewName: 'Vista previa real de Kitchen',
  propertiesName: 'Tablero y comandas',
  permission: 'kitchen.view',
  help: 'Estados, tiempos, destinos, notas y correcciones siempre visibles. El diseño no cambia el flujo de cocina.',
  defaults: defaultKitchenLayout,
  parse: parseKitchenLayout,
  numbers: Object.fromEntries(
    Object.entries(kitchenBounds).map(([key, [min, max]]) => [
      key,
      { label: labels[key as keyof typeof labels], min, max },
    ]),
  ),
  colors: {
    new_color: 'Color nuevas',
    preparing_color: 'Color en preparación',
    ready_color: 'Color terminadas',
  },
  presets: [
    { name: 'Original', configuration: defaultKitchenLayout },
    { name: 'Cocina Compacta', configuration: compactKitchenLayout },
  ],
  render: (config) => <KitchenBoardPage studioPreview={config} />,
}
export function KitchenStudioPage() {
  return <OperationalStudioPage definition={definition} />
}
