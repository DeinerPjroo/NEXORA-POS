import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace } from './helpers'

test('fotografía privada y variantes: guardar, persistir, editar y evitar cambios obsoletos', async ({
  page,
  context,
}) => {
  test.setTimeout(100_000)
  await fixtureWorkspace(page, 'Casa Oliva Presentaciones')
  await page.getByRole('navigation').getByRole('link', { name: 'Categorías', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Pizzas')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Pizzas', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await page.getByLabel('Nombre del producto', { exact: true }).fill('Pizza de la casa')
  await page.getByLabel('Código del producto (SKU)').fill('CASA')
  await page.getByRole('button', { name: 'Categoría: Elegir categoría' }).click()
  await page
    .getByRole('dialog', { name: 'Elige una categoría' })
    .getByRole('button', { name: 'Pizzas', exact: true })
    .click()
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('25000')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Pizza de la casa', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ver ficha y presentaciones' }).click()
  await expect(page.getByRole('heading', { name: 'La esencia del producto' })).toBeVisible()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 200
    const drawing = canvas.getContext('2d')!
    drawing.fillStyle = '#f4d1a0'
    drawing.fillRect(0, 0, 200, 200)
    drawing.fillStyle = '#b94f38'
    drawing.beginPath()
    drawing.arc(100, 100, 70, 0, Math.PI * 2)
    drawing.fill()
    drawing.fillStyle = '#f7d889'
    drawing.beginPath()
    drawing.arc(100, 100, 57, 0, Math.PI * 2)
    drawing.fill()
    drawing.fillStyle = '#569d67'
    drawing.fillRect(80, 73, 14, 22)
    drawing.fillRect(114, 113, 14, 22)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page
    .getByLabel('Fotografía del producto', { exact: true })
    .setInputFiles({ name: 'pizza.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.getByRole('button', { name: 'Guardar fotografía', exact: true }).click()
  await expect(page.getByText('Vista previa sin guardar', { exact: true })).not.toBeVisible()
  const photo = page.getByRole('img', { name: 'Fotografía de Pizza de la casa', exact: true })
  await expect(photo).toHaveAttribute('src', /\/api\/v1\/products\/\d+\/image\?version=/)
  await expect(photo).toHaveJSProperty('naturalWidth', 200)
  await page.getByRole('button', { name: 'Nueva variante' }).click()
  await page.getByLabel('Nombre de la variante').fill('Grande')
  await page.getByLabel('SKU de la variante', { exact: true }).fill('CASA-G')
  await page.getByLabel('Precio de la variante (COP)', { exact: true }).fill('38900.125')
  await page.getByLabel('Costo de la variante (COP)', { exact: true }).fill('9500.0025')
  await page.getByRole('button', { name: 'Guardar variante', exact: true }).click()
  await expect(page.getByRole('row', { name: /Grande CASA-G/ })).toBeVisible()
  await page.reload()
  await expect(photo).toHaveJSProperty('naturalWidth', 200)
  await expect(page.getByRole('row', { name: /Grande CASA-G/ })).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/product-detail-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  const other = await context.newPage()
  await other.goto(page.url())
  await other.getByRole('button', { name: 'Editar variante Grande', exact: true }).click()
  await other.getByLabel('Precio de la variante (COP)', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Editar variante Grande', exact: true }).click()
  await page.getByLabel('Precio de la variante (COP)', { exact: true }).fill('42000')
  await page.getByRole('button', { name: 'Guardar variante', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await other.getByRole('button', { name: 'Guardar variante', exact: true }).click()
  await expect(other.getByRole('alert')).toContainText('El producto cambió')
  await other.close()
  await page.reload()
  await expect(page.getByRole('row', { name: /Grande CASA-G/ })).toContainText('42.000,00')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/product-detail-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Quitar fotografía', exact: true }).click()
  await expect(page.getByText('Una imagen que abra el apetito.', { exact: true })).toBeVisible()
  const imageUrl =
    new URL(page.url()).pathname.replace('/productos/', '/api/v1/products/') + '/image'
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu próximo gran paso.', exact: true }),
  ).toBeVisible()
  const privateResponse = await page.request.get(imageUrl, {
    timeout: 10000,
    headers: { Referer: page.url(), Accept: 'image/png' },
  })
  expect(privateResponse.status()).toBe(401)
})
