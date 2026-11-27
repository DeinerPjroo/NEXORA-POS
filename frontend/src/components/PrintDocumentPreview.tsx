import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { useSession } from '../features/auth/SessionProvider'
import '../features/orders/order-print.css'
import { usePrintLayout } from '../features/studio/usePrintLayout'
import { PrintLayoutFrame } from '../features/studio/print-layout'

export function PrintDocumentPreview({
  title,
  children,
  onClose,
  surface = 'kitchen_print',
}: {
  title: string
  children: (width: string) => ReactNode
  onClose: () => void
  surface?: 'receipt' | 'kitchen_print'
}) {
  const { session, screenBlocked } = useSession()
  const layout = usePrintLayout(surface)
  const [chosenWidth, setWidth] = useState<string | null>(null)
  const width = chosenWidth ?? String(layout.configuration?.tokens.paper_width ?? 80)
  const [error, setError] = useState('')
  if (!session || screenBlocked) return null
  const content = (
    <PrintLayoutFrame config={layout.configuration} width={width}>
      {children(width)}
    </PrintLayoutFrame>
  )
  return (
    <>
      <Modal title={title} onClose={onClose}>
        <div className="print-controls">
          <label>
            Papel
            <select
              aria-label="Ancho de papel"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            >
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </select>
          </label>
          <button
            type="button"
            className="button primary"
            disabled={!layout.ready}
            onClick={() => {
              try {
                window.print()
              } catch {
                setError('No se pudo abrir la impresión del navegador. Inténtalo de nuevo.')
              }
            }}
          >
            Abrir impresión
          </button>
        </div>
        <p className="muted">
          Selecciona tu impresora en el navegador. Abrir este diálogo no confirma una impresión
          física.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="ticket-preview">{content}</div>
      </Modal>
      {createPortal(
        <div className="operational-print-root">
          <style media="print">{'@page { size: auto; margin: 4mm; }'}</style>
          {content}
        </div>,
        document.body,
      )}
    </>
  )
}
