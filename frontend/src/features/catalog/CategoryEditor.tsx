import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Modal, Submit, useToast } from '../../components/ui'
import type { Category } from './types'

export function CategoryEditor({
  category,
  onClose,
}: {
  category: Category | null
  onClose: () => void
}) {
  const client = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`categories${category ? `/${category.id}` : ''}`, {
        method: category ? 'PUT' : 'POST',
        body,
      }),
    onSuccess: async () => {
      await Promise.all(
        ['categories', 'products', 'overview'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      toast(category ? 'Categoría actualizada.' : 'Categoría creada.')
      onClose()
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    mutation.mutate({
      ...Object.fromEntries(data),
      is_active: data.get('is_active') === 'on',
      ...(category ? { revision: category.revision } : {}),
    })
  }
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409
  return (
    <Modal
      title={category ? `Editar categoría: ${category.name}` : 'Una categoría para tu menú'}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={mutation.error} />
        <Field label="Nombre de la categoría">
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={category?.name}
            autoFocus
            placeholder="Ej. Pizzas artesanales"
          />
        </Field>
        <Field label="Descripción de la categoría">
          <textarea
            name="description"
            rows={3}
            maxLength={500}
            defaultValue={category?.description ?? ''}
            placeholder="¿Qué hace especial a esta parte de tu menú?"
          />
        </Field>
        <Field label="Color de la categoría">
          <input
            className="category-color-input"
            name="color"
            type="color"
            defaultValue={category?.color ?? '#8271FF'}
          />
        </Field>
        <label className="checkbox-line">
          <input name="is_active" type="checkbox" defaultChecked={category?.is_active ?? true} />
          <span>Categoría activa</span>
        </label>
        <p className="muted small">
          Al desactivar una categoría, sus productos dejan de estar habilitados para pedidos. Su
          información se conserva.
        </p>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {conflict ? 'Cerrar y actualizar' : 'Cancelar'}
          </button>
          <Submit pending={mutation.isPending} disabled={conflict} />
        </div>
      </form>
    </Modal>
  )
}
