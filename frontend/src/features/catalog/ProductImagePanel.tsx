import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, RefreshCw, Trash2, Upload, UtensilsCrossed } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, useToast } from '../../components/ui'
import { useCan } from '../auth/SessionProvider'
import type { Product } from './types'

export function ProductImagePanel({ product }: { product: Product }) {
  const can = useCan()
  const client = useQueryClient()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [selectionRevision, setSelectionRevision] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const mutation = useMutation({
    mutationFn: (action: 'upload' | 'remove') => {
      if (action === 'remove')
        return api(`products/${product.id}/image`, {
          method: 'DELETE',
          body: { revision: product.revision },
        })
      const body = new FormData()
      body.append('revision', String(selectionRevision ?? product.revision))
      if (file) body.append('image', file)
      return api(`products/${product.id}/image`, { method: 'POST', body })
    },
    onSuccess: async () => {
      await Promise.all(
        ['product', 'products', 'variants'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      setFile(null)
      setSelectionRevision(null)
      if (input.current) input.current.value = ''
      toast('Fotografía del producto actualizada.')
    },
  })
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409
  return (
    <section className="panel product-image-panel">
      <div className="panel-heading">
        <h2>
          <ImagePlus size={18} />
          Fotografía
        </h2>
        <span className="pill neutral">Tu producto</span>
      </div>
      <div className="product-photo-stage">
        {preview || product.image_url ? (
          <img src={preview ?? product.image_url!} alt={`Fotografía de ${product.name}`} />
        ) : (
          <div className="photo-placeholder">
            <UtensilsCrossed size={45} strokeWidth={1.2} />
            <p>Una imagen que abra el apetito.</p>
          </div>
        )}
        {preview && (
          <span className="pill violet preview-photo-label">Vista previa sin guardar</span>
        )}
      </div>
      <ErrorNotice error={mutation.error} />
      <p className="muted small">
        Esta fotografía es la portada. La galería permite conservar otras imágenes; al quitar la
        portada se mostrará la siguiente si existe.
      </p>
      {can('catalog.manage') && (
        <>
          <label className="photo-file-label">
            <Upload size={16} />
            <span>Elegir fotografía</span>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Fotografía del producto"
              disabled={mutation.isPending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setSelectionRevision(product.revision)
                mutation.reset()
              }}
            />
          </label>
          <p className="muted small">
            JPEG, PNG o WebP · Hasta 2 MB · Entre 32 y 2048 px por lado.
          </p>
          <div className="photo-actions">
            <button
              className="button primary"
              disabled={!file || mutation.isPending || conflict}
              onClick={() => mutation.mutate('upload')}
            >
              <Upload size={15} />
              {mutation.isPending ? 'Guardando…' : 'Guardar fotografía'}
            </button>
            {product.image_url && (
              <button
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate('remove')}
              >
                <Trash2 size={15} />
                Quitar fotografía
              </button>
            )}
          </div>
          {conflict && (
            <button
              className="text-button"
              onClick={async () => {
                await client.invalidateQueries({ queryKey: ['product', product.id] })
                setFile(null)
                setSelectionRevision(null)
                if (input.current) input.current.value = ''
                mutation.reset()
              }}
            >
              <RefreshCw size={14} />
              Actualizar ficha para revisar los cambios
            </button>
          )}
        </>
      )}
    </section>
  )
}
