import { lazy, Suspense } from 'react'
import { Loading } from '../../components/ui'
import { widgetNames } from '../dashboard/widgets'
import { OperationalStudioPage, type SurfaceDefinition } from './OperationalStudioPage'
import {
  compactDashboardLayout,
  defaultDashboardLayout,
  dashboardBounds,
  parseDashboardLayout,
  type DashboardLayout,
} from './dashboard-layout'
const CommercialPanel = lazy(() =>
  import('../dashboard/CommercialPanel').then((module) => ({ default: module.CommercialPanel })),
)
const labels = {
  columns: 'Columnas de indicadores',
  gap: 'Separación',
  radius: 'Esquinas',
  font_size: 'Tamaño de texto',
}
const definition: SurfaceDefinition<DashboardLayout> = {
  surface: 'dashboard',
  title: 'Diseña el Dashboard',
  eyebrow: 'NEXORA STUDIO / DASHBOARD',
  description:
    'Personaliza orden, visibilidad y estilo del resumen comercial con sus datos y permisos reales.',
  editorName: 'Editor de Dashboard',
  previewName: 'Vista previa real de Dashboard',
  propertiesName: 'Widgets e indicadores',
  permission: 'dashboard.view',
  help: 'Publicar no concede permisos. Las preferencias personales solo pueden ocultar widgets habilitados por el diseño.',
  defaults: defaultDashboardLayout,
  parse: parseDashboardLayout,
  numbers: Object.fromEntries(
    Object.entries(dashboardBounds).map(([key, [min, max]]) => [
      key,
      { label: labels[key as keyof typeof labels], min, max },
    ]),
  ),
  colors: { accent: 'Color de acento' },
  flags: widgetNames,
  presets: [
    { name: 'Original', configuration: defaultDashboardLayout },
    { name: 'Dashboard Compacto', configuration: compactDashboardLayout },
  ],
  render: (config) => (
    <Suspense fallback={<Loading />}>
      <CommercialPanel studioPreview={config} />
    </Suspense>
  ),
  extra: (config, onChange) => (
    <div className="studio-widget-order" role="group" aria-label="Orden de widgets">
      {config.widgets.map((key, index) => (
        <div key={key}>
          <strong>{widgetNames[key]}</strong>
          {([-1, 1] as const).map((step) => (
            <button
              key={step}
              type="button"
              aria-label={`${step === -1 ? 'Subir' : 'Bajar'} ${widgetNames[key]}`}
              disabled={index + step < 0 || index + step >= config.widgets.length}
              onClick={() => {
                const widgets = [...config.widgets]
                ;[widgets[index], widgets[index + step]] = [widgets[index + step], widgets[index]]
                onChange({ ...config, widgets })
              }}
            >
              {step === -1 ? '↑' : '↓'}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}
export function DashboardStudioPage() {
  return <OperationalStudioPage definition={definition} />
}
