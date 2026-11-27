import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ErrorNotice, Field, Modal, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { parsePosLayout, type PosLayout } from './pos-layout'

type Template = { id: number; name: string; revision: number; configuration: unknown }
type Action =
  | { action: 'create'; configuration: PosLayout }
  | { action: 'duplicate' | 'rename'; template: Template }

export function StudioTemplates({
  config,
  disabled,
  onApply,
  onBusy,
}: {
  config: PosLayout
  disabled: boolean
  onApply: (config: PosLayout) => void
  onBusy: (busy: boolean) => void
}) {
  const can = useCan()
  const toast = useToast()
  const [action, setAction] = useState<Action | null>(null)
  const query = useQuery({
    queryKey: ['studio-pos-templates'],
    queryFn: () => api<{ data: Template[] }>('studio/pos/templates'),
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    onBusy(!!action)
    return () => onBusy(false)
  }, [action, onBusy])
  return (
    <section className="panel studio-personal-templates" aria-label="Plantillas personales">
      <header>
        <h2>Mis plantillas</h2>
        <button
          type="button"
          className="button secondary"
          disabled={disabled || !can('studio.edit')}
          onClick={() => setAction({ action: 'create', configuration: structuredClone(config) })}
        >
          Guardar como plantilla
        </button>
      </header>
      <ErrorNotice error={query.error} />
      <button
        type="button"
        disabled={disabled || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar plantillas
      </button>
      <p>Compartidas dentro de tu empresa. Aplicarlas modifica solo el borrador local.</p>
      {query.isPending ? (
        <p>Cargando plantillas…</p>
      ) : (
        !query.data?.data.length && <p>Aún no tienes plantillas personales.</p>
      )}
      <div className="studio-template-list">
        {query.data?.data.map((template) => (
          <article key={template.id}>
            <strong>{template.name}</strong>
            <small>Revisión {template.revision}</small>
            <div className="form-actions">
              <button
                type="button"
                disabled={disabled || !can('studio.edit')}
                onClick={() => {
                  const parsed = parsePosLayout(template.configuration)
                  if (parsed) onApply(parsed)
                  else toast('Esta plantilla requiere un esquema compatible.')
                }}
              >
                Aplicar
              </button>
              <button
                type="button"
                disabled={disabled || !can('studio.edit')}
                onClick={() => setAction({ action: 'duplicate', template })}
              >
                Duplicar
              </button>
              <button
                type="button"
                disabled={disabled || !can('studio.edit')}
                onClick={() => setAction({ action: 'rename', template })}
              >
                Renombrar
              </button>
            </div>
          </article>
        ))}
      </div>
      {action && <TemplateAction value={action} onClose={() => setAction(null)} />}
    </section>
  )
}

function TemplateAction({ value, onClose }: { value: Action; onClose: () => void }) {
  const client = useQueryClient()
  const toast = useToast()
  const operation = useOperation<Template>('studio/pos/templates', () => {
    void client.invalidateQueries({ queryKey: ['studio-pos-templates'] })
    toast('Plantilla guardada. La publicación de Terminal se conserva.')
    onClose()
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    operation.send(
      value.action === 'create'
        ? { action: value.action, name, configuration: value.configuration }
        : {
            action: value.action,
            name,
            template_id: value.template.id,
            revision: value.template.revision,
          },
    )
  }
  return (
    <Modal
      title={
        value.action === 'rename'
          ? 'Renombrar plantilla'
          : value.action === 'duplicate'
            ? 'Duplicar plantilla'
            : 'Guardar plantilla personal'
      }
      locked={operation.locked}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset disabled={operation.locked}>
          <Field label="Nombre de la plantilla">
            <input
              name="name"
              required
              maxLength={80}
              autoFocus
              defaultValue={
                value.action === 'create'
                  ? ''
                  : value.action === 'duplicate'
                    ? `${value.template.name.slice(0, 70)} (copia)`
                    : value.template.name
              }
            />
          </Field>
        </fieldset>
        <p>Esta acción no guarda ni publica el diseño de la terminal.</p>
        <div className="form-actions">
          <button type="button" disabled={operation.locked} onClick={onClose}>
            Volver
          </button>
          <button type="submit" className="button primary" disabled={operation.isPending}>
            {operation.uncertain ? 'Reintentar mismo guardado' : 'Guardar plantilla'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
