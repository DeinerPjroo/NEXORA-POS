import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Loading } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperationContext } from '../operations/OperationalBranchPicker'
import { ThermalSaleReceipt } from '../sales/SalePrintButton'
import type { Sale } from '../sales/types'
import type { KitchenTicket } from '../kitchen/types'
import { OperationalTicketDocument } from '../orders/OrderPrintActions'
import { OperationalStudioPage, type SurfaceDefinition } from './OperationalStudioPage'
import {
  compactPrintLayout,
  defaultPrintLayout,
  parsePrintLayout,
  PrintLayoutFrame,
  type PrintLayout,
} from './print-layout'

function ReceiptExample({ config }: { config: PrintLayout }) {
  const can = useCan()
  const list = useQuery({
    queryKey: ['studio-receipt-example-list'],
    queryFn: () => api<{ data: { id: number }[] }>('sales?page=1'),
    enabled: can('sales.view'),
    refetchOnWindowFocus: false,
  })
  const id = list.data?.data[0]?.id
  const sale = useQuery({
    queryKey: ['studio-receipt-example', id],
    queryFn: () => api<{ data: Sale }>(`sales/${id}`),
    enabled: !!id && can('sales.view'),
    refetchOnWindowFocus: false,
  })
  return (
    <div className="studio-document-example">
      <p>Vista previa del primer recibo disponible. No registra ventas ni pagos.</p>
      <ErrorNotice error={list.error || sale.error} />
      {list.isPending || (id && sale.isPending) ? (
        <Loading />
      ) : sale.data ? (
        <PrintLayoutFrame config={config} width={String(config.tokens.paper_width)}>
          <ThermalSaleReceipt sale={sale.data.data} width={String(config.tokens.paper_width)} />
        </PrintLayoutFrame>
      ) : (
        <p>
          No hay recibos registrados para previsualizar. El diseño se puede guardar sin crear una
          venta.
        </p>
      )}
    </div>
  )
}
function KitchenExample({ config }: { config: PrintLayout }) {
  const context = useOperationContext()
  const branch = context.data?.branches.find((item) => item.is_active)?.id
  const query = useQuery({
    queryKey: ['studio-kitchen-print-example', branch],
    queryFn: () => api<{ data: KitchenTicket[] }>(`kitchen-tickets?branch_id=${branch}`),
    enabled: !!branch,
    refetchOnWindowFocus: false,
  })
  const ticket = query.data?.data[0]
  return (
    <div className="studio-document-example">
      <p>Comanda real de la sucursal autorizada. Es una copia; no reenvía productos.</p>
      <ErrorNotice error={context.error || query.error} />
      {query.isPending ? (
        <Loading />
      ) : ticket ? (
        <PrintLayoutFrame config={config} width={String(config.tokens.paper_width)}>
          <OperationalTicketDocument ticket={ticket} width={String(config.tokens.paper_width)} />
        </PrintLayoutFrame>
      ) : (
        <p>No hay comandas registradas para previsualizar. No se generan comandas de ejemplo.</p>
      )}
    </div>
  )
}
export function PrintStudioPage({ surface }: { surface: 'receipt' | 'kitchen_print' }) {
  const receipt = surface === 'receipt'
  const definition: SurfaceDefinition<PrintLayout> = {
    surface,
    title: receipt ? 'Diseña el recibo de venta' : 'Diseña comandas y borradores',
    eyebrow: 'NEXORA STUDIO / IMPRESIÓN',
    description:
      'Formato térmico del navegador. Los datos y advertencias obligatorias permanecen intactos.',
    editorName: receipt ? 'Editor de Recibos' : 'Editor de Comandas',
    previewName: 'Vista previa real de impresión',
    propertiesName: 'Papel y tipografía',
    permission: receipt ? 'sales.view' : 'kitchen.view',
    help: 'Recibos internos, no factura electrónica. Imprimir no crea pagos ni reenvía comandas. El operador puede elegir 58/80 mm al abrir la impresión.',
    defaults: defaultPrintLayout,
    parse: parsePrintLayout,
    numbers: {
      font_size: { label: 'Tamaño de letra', min: 10, max: 16 },
      line_height: { label: 'Interlineado (%)', min: 120, max: 170 },
      spacing: { label: 'Espaciado de líneas', min: 2, max: 8 },
    },
    colors: {},
    flags: { center_header: 'Centrar encabezados' },
    presets: [
      { name: 'Original', configuration: defaultPrintLayout },
      { name: 'Térmico compacto 58 mm', configuration: compactPrintLayout },
    ],
    render: (config) =>
      receipt ? <ReceiptExample config={config} /> : <KitchenExample config={config} />,
    extra: (config, onChange) => (
      <>
        <Field label="Papel inicial">
          <select
            value={config.tokens.paper_width}
            onChange={(event) =>
              onChange({
                ...config,
                tokens: { ...config.tokens, paper_width: Number(event.target.value) },
              })
            }
          >
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </Field>
        <Field label="Pie de texto adicional">
          <textarea
            aria-label="Pie de texto adicional"
            rows={3}
            maxLength={180}
            value={config.texts.footer}
            onChange={(event) => onChange({ ...config, texts: { footer: event.target.value } })}
          />
        </Field>
      </>
    ),
  }
  return <OperationalStudioPage key={surface} definition={definition} />
}
