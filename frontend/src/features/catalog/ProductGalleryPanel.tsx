import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { ErrorNotice, Field, Loading, Modal, Submit, useToast } from '../../components/ui'
import { useCan, useSession } from '../auth/SessionProvider'
import { useOperation } from '../operations/useOperation'
import { OperationNotice } from '../operations/OperationNotice'
import { CatalogError } from './catalog-ui'
import type { CatalogPage, Product } from './types'

type GalleryImage = {
  id: number
  product_id: number
  mime: string
  position: number
  is_active: boolean
  image_url: string
}
type Gallery = CatalogPage<GalleryImage> & {
  product_revision: number
  cover_image_id: number | null
  limit: number
}
type Action = { kind: 'cover' | 'remove' | 'order'; image?: GalleryImage; gallery: Gallery }

function useGalleryWrite(path: string, method: 'POST' | 'PUT' | 'DELETE', close: () => void) {
  const client = useQueryClient()
  const toast = useToast()
  const refresh = () =>
    Promise.all(
      ['product', 'products', 'variants', 'product-gallery'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
  const operation = useOperation(
    path,
    async () => {
      await refresh()
      toast('Galería actualizada.')
      close()
    },
    method,
  )
  return { ...operation, refresh }
}

function GalleryUpload({ product, onClose }: { product: Product; onClose: () => void }) {
  const { session } = useSession()
  const [snapshot] = useState({ revision: product.revision, currency: session!.company.currency })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const operation = useGalleryWrite(`products/${product.id}/images`, 'POST', onClose)
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  function close() {
    if (conflict) void operation.refresh()
    onClose()
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.uncertain) {
      operation.send({})
      return
    }
    if (!file) return
    const body = new FormData(event.currentTarget)
    body.set('product_revision', String(snapshot.revision))
    body.set('currency', snapshot.currency)
    body.set('image', file)
    body.set('make_cover', body.get('make_cover') === 'on' ? '1' : '0')
    operation.send(body)
  }
  return (
    <Modal title={`Agregar fotografía · ${product.name}`} onClose={close}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          <Field label="Fotografía de la galería">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          {preview && (
            <img
              className="gallery-upload-preview"
              src={preview}
              alt="Vista previa de la fotografía nueva"
            />
          )}
          <label className="checkbox-line">
            <input name="make_cover" type="checkbox" defaultChecked={!product.image_url} />
            <span>Usar esta fotografía como portada</span>
          </label>
          <p className="muted small">
            JPEG, PNG o WebP · Hasta 2 MB · Entre 32 y 2048 px por lado. Hasta ocho fotografías
            privadas; la primera será portada.
          </p>
        </fieldset>
        {conflict && (
          <p className="notice">
            La ficha cambió. Cierra y vuelve a elegir la fotografía con la revisión actual.
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={close}>
            Cerrar
          </button>
          <Submit
            pending={operation.isPending}
            disabled={!operation.uncertain && (!file || conflict)}
          >
            {operation.uncertain ? 'Reintentar fotografía' : 'Agregar a galería'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}

function GalleryAction({
  product,
  gallery,
  action,
  onClose,
}: {
  product: Product
  gallery: Gallery
  action: Action
  onClose: () => void
}) {
  const { session } = useSession()
  const [snapshot] = useState({
    revision: gallery.product_revision,
    currency: session!.company.currency,
  })
  const [images, setImages] = useState(gallery.data)
  const path = `products/${product.id}/images/${action.kind === 'order' ? 'order' : `${action.image!.id}${action.kind === 'cover' ? '/cover' : ''}`}`
  const operation = useGalleryWrite(path, action.kind === 'remove' ? 'DELETE' : 'PUT', onClose)
  const conflict = operation.error instanceof ApiError && operation.error.status === 409
  function close() {
    if (conflict) void operation.refresh()
    onClose()
  }
  function move(index: number, delta: number) {
    const next = [...images]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setImages(next)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    operation.send({
      product_revision: snapshot.revision,
      currency: snapshot.currency,
      ...(action.kind === 'order' ? { image_ids: images.map((image) => image.id) } : {}),
    })
  }
  const title =
    action.kind === 'order'
      ? 'Ordenar galería'
      : action.kind === 'cover'
        ? 'Elegir portada'
        : 'Retirar fotografía'
  return (
    <Modal title={title} onClose={close}>
      <form className="form-stack" onSubmit={submit}>
        <ErrorNotice error={operation.error} />
        <OperationNotice uncertain={operation.uncertain} />
        <fieldset className="form-stack" disabled={operation.locked}>
          {action.kind === 'order' ? (
            images.map((image, index) => (
              <div className="gallery-order-row" key={image.id}>
                <img src={image.image_url} alt={`Fotografía ${index + 1}`} />
                <span>Fotografía {index + 1}</span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={index === 0}
                  aria-label={`Subir fotografía ${index + 1}`}
                  onClick={() => move(index, -1)}
                >
                  Subir
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={index === images.length - 1}
                  aria-label={`Bajar fotografía ${index + 1}`}
                  onClick={() => move(index, 1)}
                >
                  Bajar
                </button>
              </div>
            ))
          ) : (
            <>
              <img
                className="gallery-upload-preview"
                src={action.image!.image_url}
                alt="Fotografía seleccionada"
              />
              <p>
                {action.kind === 'cover'
                  ? 'Esta fotografía aparecerá como portada en el catálogo. Las demás se conservarán.'
                  : 'Se retirará esta fotografía de la galería. Si es la portada, se elegirá la siguiente por orden; si no quedan imágenes, el producto quedará sin fotografía.'}
              </p>
            </>
          )}
        </fieldset>
        {conflict && (
          <p className="notice">La galería cambió. Cierra y revisa las fotografías actuales.</p>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={close}>
            Cerrar
          </button>
          <Submit pending={operation.isPending} disabled={conflict && !operation.uncertain}>
            {operation.uncertain
              ? 'Reintentar cambio'
              : action.kind === 'remove'
                ? 'Confirmar retirada'
                : action.kind === 'cover'
                  ? 'Guardar portada'
                  : 'Guardar orden'}
          </Submit>
        </div>
      </form>
    </Modal>
  )
}

export function ProductGalleryPanel({ product }: { product: Product }) {
  const can = useCan()
  const [uploading, setUploading] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const query = useQuery({
    queryKey: ['product-gallery', product.id, product.revision],
    queryFn: ({ signal }) => api<Gallery>(`products/${product.id}/images?per_page=8`, { signal }),
  })
  const current = query.data?.product_revision === product.revision
  return (
    <section className="panel variants-panel product-gallery">
      <div className="panel-heading">
        <h2>Galería privada</h2>
        {can('catalog.manage') && (
          <div className="combo-actions">
            <button
              className="button secondary"
              disabled={!current || (query.data?.data.length ?? 0) < 2}
              onClick={() => setAction({ kind: 'order', gallery: query.data! })}
            >
              Ordenar galería
            </button>
            <button
              className="button primary"
              disabled={!current || (query.data?.meta.total ?? 0) >= 8}
              onClick={() => setUploading(true)}
            >
              Agregar fotografía
            </button>
          </div>
        )}
      </div>
      <p className="muted small">
        Hasta ocho fotografías. La portada conserva el acceso privado del catálogo; puedes cambiarla
        sin retirar las demás.
      </p>
      {query.error ? (
        <CatalogError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <>
          <p>
            {query.data.meta.total} de {query.data.limit} fotografías
          </p>
          {!current && (
            <p className="notice">
              La ficha cambió. Actualiza el producto antes de modificar la galería.
            </p>
          )}
          <div className="gallery-grid">
            {query.data.data.map((image, index) => (
              <article className="gallery-card" key={image.id}>
                <img src={image.image_url} alt={`Galería de ${product.name} · Foto ${index + 1}`} />
                <strong>
                  Fotografía {index + 1}
                  {query.data.cover_image_id === image.id ? ' · Portada' : ''}
                </strong>
                {can('catalog.manage') && (
                  <div className="combo-actions">
                    <button
                      className="text-button"
                      disabled={!current || query.data.cover_image_id === image.id}
                      aria-label={`Usar fotografía ${index + 1} como portada`}
                      onClick={() => setAction({ kind: 'cover', image, gallery: query.data })}
                    >
                      Usar como portada
                    </button>
                    <button
                      className="text-button"
                      disabled={!current}
                      aria-label={`Retirar fotografía ${index + 1}`}
                      onClick={() => setAction({ kind: 'remove', image, gallery: query.data })}
                    >
                      Retirar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!query.data.data.length && (
            <p className="empty-inline muted">Agrega la primera fotografía del producto.</p>
          )}
        </>
      )}
      {uploading && <GalleryUpload product={product} onClose={() => setUploading(false)} />}
      {action && (
        <GalleryAction
          product={product}
          gallery={action.gallery}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </section>
  )
}
