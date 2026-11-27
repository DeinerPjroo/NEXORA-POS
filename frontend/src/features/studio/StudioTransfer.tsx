import { useEffect, useState, type ChangeEvent } from 'react'
import { api } from '../../lib/api'
import { ErrorNotice, Modal, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { scopeQuery, type LayoutScope } from './layout-scope'
import type { SavedPosLayout } from './PosStudioPage'

export function StudioTransfer({
  surface,
  scope,
  revision,
  disabled,
  onBusy,
  onSaved,
}: {
  surface: string
  scope: LayoutScope
  revision: number
  disabled: boolean
  onBusy: (busy: boolean) => void
  onSaved: (layout: SavedPosLayout) => void
}) {
  const can = useCan()
  const [file, setFile] = useState<{ name: string; envelope: unknown } | null>(null)
  const [reading, setReading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    onBusy(!!file || reading || exporting)
    return () => onBusy(false)
  }, [file, reading, exporting, onBusy])
  async function exportLayout() {
    setExporting(true)
    setError(null)
    try {
      const envelope = await api<unknown>(`studio/${surface}/export?${scopeQuery(scope)}`)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `nexora-${surface}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e)
    } finally {
      setExporting(false)
    }
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    setReading(true)
    setError(null)
    try {
      if (
        !selected.name.toLowerCase().endsWith('.json') ||
        selected.size > 65536 ||
        selected.size === 0
      )
        throw new Error('Selecciona un archivo JSON de hasta 64 KB.')
      const envelope: unknown = JSON.parse(await selected.text())
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        Array.isArray(envelope) ||
        !('format' in envelope) ||
        envelope.format !== 'nexora-studio' ||
        !('version' in envelope) ||
        envelope.version !== 1 ||
        !('surface' in envelope) ||
        envelope.surface !== surface
      )
        throw new Error('El archivo no corresponde a esta superficie o versión de Nexora Studio.')
      setFile({ name: selected.name, envelope })
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error('El archivo no contiene JSON válido.') : e)
    } finally {
      setReading(false)
    }
  }
  return (
    <section className="panel studio-transfer" aria-label="Importar y exportar diseño">
      <div className="form-actions">
        <button type="button" disabled={disabled || !revision} onClick={() => void exportLayout()}>
          Exportar borrador guardado
        </button>
        <label>
          Importar diseño JSON
          <input
            aria-label="Importar diseño JSON"
            type="file"
            accept=".json,application/json"
            disabled={disabled || !can('studio.edit')}
            onChange={(event) => void readFile(event)}
          />
        </label>
      </div>
      <small>
        Guarda o descarta los cambios locales antes de transferir. El archivo contiene configuración
        visual, sin registros del restaurante.
      </small>
      <ErrorNotice error={error} />
      {file && (
        <ImportAction
          surface={surface}
          scope={scope}
          revision={revision}
          file={file}
          onClose={() => setFile(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  )
}
function ImportAction({
  surface,
  scope,
  revision,
  file,
  onClose,
  onSaved,
}: {
  surface: string
  scope: LayoutScope
  revision: number
  file: { name: string; envelope: unknown }
  onClose: () => void
  onSaved: (layout: SavedPosLayout) => void
}) {
  const toast = useToast()
  const operation = useOperation<SavedPosLayout>(`studio/${surface}/import`, (result) => {
    onSaved(result)
    onClose()
    toast('Diseño importado como borrador. Publica para aplicarlo.')
  })
  return (
    <Modal title="Importar diseño como borrador" locked={operation.locked} onClose={onClose}>
      <p>
        {file.name}. Se validará el esquema en el servidor y se guardará un nuevo borrador. La
        publicación actual se conserva.
      </p>
      <ErrorNotice error={operation.error} />
      <OperationNotice uncertain={operation.uncertain} />
      <div className="form-actions">
        <button type="button" disabled={operation.locked} onClick={onClose}>
          Volver
        </button>
        <button
          type="button"
          className="button primary"
          disabled={operation.isPending}
          onClick={() => operation.send({ ...scope, revision, envelope: file.envelope })}
        >
          {operation.uncertain ? 'Reintentar misma importación' : 'Validar e importar borrador'}
        </button>
      </div>
    </Modal>
  )
}
