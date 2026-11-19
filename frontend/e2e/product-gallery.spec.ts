import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product } from '../src/features/catalog/types'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

type Gallery = {
  data: { id: number; image_url: string }[]
  cover_image_id: number
  product_revision: number
}

test('galería privada: multipart incierto, portada, orden, retirada y privacidad', async ({
  page,
}) => {
  test.setTimeout(240_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Galería')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name: 'Pizza galería',
      sku: 'PIZZA-GAL',
      category_id: category.id,
      sale_price: '10',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const path = `products/${product.id}`
  await page.goto(`/productos/${product.id}`)
  const png = async (color: string, size: number) =>
    Buffer.from(
      await page.evaluate(
        ({ color, size }) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = size
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = color
          ctx.fillRect(0, 0, size, size)
          return canvas.toDataURL('image/png').split(',')[1]
        },
        { color, size },
      ),
      'base64',
    )
  const red = await png('#b94f38', 64)
  const blue = await png('#2b719f', 96)
  await page.getByRole('button', { name: 'Agregar fotografía', exact: true }).click()
  const uploader = page.getByRole('dialog', {
    name: 'Agregar fotografía · Pizza galería',
    exact: true,
  })
  await uploader
    .getByLabel('Fotografía de la galería', { exact: true })
    .setInputFiles({ name: 'roja.png', mimeType: 'image/png', buffer: red })
  const multipartBodies: string[] = []
  await page.route(`**/api/v1/${path}/images`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const boundary = route
      .request()
      .headers()
      ['content-type'].match(/boundary=([^;]+)/)![1]
      .replaceAll(String.fromCharCode(34), '')
    multipartBodies.push(
      route.request().postDataBuffer()!.toString('binary').split(boundary).join('<boundary>'),
    )
    const response = await route.fetch()
    if (multipartBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await uploader.getByRole('button', { name: 'Agregar a galería', exact: true }).click()
  await expect(
    uploader.getByRole('button', { name: 'Reintentar fotografía', exact: true }),
  ).toBeVisible()
  await expect(uploader.getByLabel('Fotografía de la galería', { exact: true })).toBeDisabled()
  // Otra escritura cambia revisión mientras la respuesta original es incierta.
  const root = (await readApi<{ data: Product }>(page, path)).data
  await page.request.get('/sanctum/csrf-cookie')
  const xsrf = (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')!
  const second = await page.request.post(`/api/v1/${path}/images`, {
    headers: {
      Origin: 'http://127.0.0.1:5199',
      Accept: 'application/json',
      'X-XSRF-TOKEN': decodeURIComponent(xsrf.value),
    },
    multipart: {
      idempotency_key: crypto.randomUUID(),
      product_revision: String(root.revision),
      currency: 'COP',
      image: { name: 'azul.png', mimeType: 'image/png', buffer: blue },
    },
  })
  expect(second.ok()).toBe(true)
  await uploader.getByRole('button', { name: 'Reintentar fotografía', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(multipartBodies).toHaveLength(2)
  expect(multipartBodies[0]).toBe(multipartBodies[1])
  await page.unroute(`**/api/v1/${path}/images`)
  const gallery = page.locator('.product-gallery')
  await expect(gallery).toContainText('2 de 8 fotografías')
  const first = (await readApi<Gallery>(page, `${path}/images`)).data[0]
  await page.getByRole('button', { name: 'Usar fotografía 2 como portada', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar portada', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('img', { name: 'Fotografía de Pizza galería', exact: true }),
  ).toHaveJSProperty('naturalWidth', 96)
  await page.getByRole('button', { name: 'Ordenar galería', exact: true }).click()
  await page.getByRole('button', { name: 'Subir fotografía 2', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar orden', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(gallery.locator('.gallery-card').first()).toContainText('Portada')
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await gallery.locator('.gallery-card img').last().scrollIntoViewIfNeeded()
  await expect(gallery.locator('.gallery-card img').first()).toHaveJSProperty('naturalWidth', 96)
  await expect(gallery.locator('.gallery-card img').last()).toHaveJSProperty('naturalWidth', 64)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await gallery.screenshot({
    path: '../docs/screenshots/product-gallery-mobile.png',
    animations: 'disabled',
  })
  const cover = (await readApi<Gallery>(page, `${path}/images`)).cover_image_id
  const removalBodies: string[] = []
  await page.route(`**/api/v1/${path}/images/${cover}`, async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    removalBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (removalBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Retirar fotografía 1', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar retirada', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar cambio', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar cambio', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(removalBodies).toHaveLength(2)
  expect(removalBodies[0]).toBe(removalBodies[1])
  await expect(gallery).toContainText('1 de 8 fotografías')
  await expect(
    page.getByRole('img', { name: 'Fotografía de Pizza galería', exact: true }),
  ).toHaveJSProperty('naturalWidth', 64)
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu próximo gran paso.', exact: true }),
  ).toBeVisible()
  expect(
    (await page.request.get(first.image_url, { headers: { Accept: 'application/json' } })).status(),
  ).toBe(401)
  expect(errors).toEqual([])
})
