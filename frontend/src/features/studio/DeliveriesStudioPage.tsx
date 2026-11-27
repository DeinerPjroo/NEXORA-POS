import { Link } from 'react-router-dom'
import { DeliveriesPage } from '../orders/DeliveriesPage'
import { OperationalStudioPage, type SurfaceDefinition } from './OperationalStudioPage'
import {
  compactDeliveriesLayout,
  defaultDeliveriesLayout,
  deliveryBounds,
  deliveryColors,
  parseDeliveriesLayout,
  type DeliveriesLayout,
} from './deliveries-layout'
const labels = {
  detail_width: 'Ancho del detalle',
  card_width: 'Ancho de tarjeta',
  font_size: 'Tamaño del cliente',
  gap: 'Separación de tarjetas',
  radius: 'Esquinas de tarjeta',
}
const definition: SurfaceDefinition<DeliveriesLayout> = {
  surface: 'deliveries',
  title: 'Diseña Domicilios',
  eyebrow: 'NEXORA STUDIO / DOMICILIOS',
  description:
    'Personaliza el tablero de reparto y su detalle sin cambiar pedidos, cobros ni entregas.',
  editorName: 'Editor de Domicilios',
  previewName: 'Vista previa real de Domicilios',
  propertiesName: 'Tablero de domicilios',
  permission: 'orders.view',
  help: 'Cliente, dirección, estados y acciones se conservan. La búsqueda sigue limitada a la página cargada.',
  defaults: defaultDeliveriesLayout,
  parse: parseDeliveriesLayout,
  numbers: Object.fromEntries(
    Object.entries(deliveryBounds).map(([key, [min, max]]) => [
      key,
      { label: labels[key as keyof typeof labels], min, max },
    ]),
  ),
  colors: deliveryColors,
  presets: [
    { name: 'Original', configuration: defaultDeliveriesLayout },
    { name: 'Domicilios Compactos', configuration: compactDeliveriesLayout },
  ],
  render: (config, mode) => (
    <DeliveriesPage studioPreview={config} studioPreviewDetail={mode === 'detail'} />
  ),
}
export function DeliveriesStudioPage() {
  return (
    <>
      <div className="form-actions">
        <Link to="/admin/studio/domicilios/pedido">Diseñar toma de pedidos de domicilio</Link>
      </div>
      <OperationalStudioPage definition={definition} />
    </>
  )
}
