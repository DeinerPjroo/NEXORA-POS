import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Studio: viewport real, paneles móviles, edición y preview sin comandos', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await fixtureWorkspace(page, 'Studio dispositivos')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Pizzas',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza viewport',
    sku: 'VIEWPORT',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/admin/studio/pos')
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS' })
  const canvas = page.getByRole('region', { name: 'Vista previa real de Terminal' })
  const frame = canvas.frameLocator('iframe')
  const preview = frame.locator('.pos-terminal')
  await expect(frame.locator('.order-product')).toContainText('Pizza viewport')
  await expect(frame.locator('.studio-pos-render')).toHaveAttribute('inert', '')
  expect(await preview.evaluate((node) => node.ownerDocument.defaultView!.innerWidth)).toBe(1280)
  expect(await canvas.locator('iframe').getAttribute('sandbox')).toBe('allow-same-origin')
  const commands: string[] = []
  page.on('request', (request) => {
    if (
      request.url().includes('/api/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
    )
      commands.push(request.url())
  })
  await canvas
    .getByRole('button', { name: 'Seleccionar Productos y teclado', exact: true })
    .dragTo(canvas.getByRole('button', { name: 'Seleccionar Pedido y resumen', exact: true }))
  await expect(editor.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await canvas.getByLabel('Dispositivo de vista previa', { exact: true }).selectOption('tablet')
  expect(await preview.evaluate((node) => node.ownerDocument.defaultView!.innerWidth)).toBe(960)
  await expect(preview).toHaveCSS('--pos-product-columns', '2')
  await canvas.getByLabel('Dispositivo de vista previa', { exact: true }).selectOption('mobile')
  expect(await preview.evaluate((node) => node.ownerDocument.defaultView!.innerWidth)).toBe(390)
  await expect(preview).toHaveAttribute('data-pos-panel', 'menu')
  await expect(frame.locator('.pos-actions')).toBeHidden()
  await expect(frame.locator('.order-menu')).toBeVisible()
  await expect(preview).toHaveCSS('--pos-product-columns', '2')
  await canvas.getByLabel('Panel de vista previa', { exact: true }).selectOption('cart')
  await expect(frame.locator('.order-menu')).toBeHidden()
  await expect(frame.locator('.pos-actions')).toBeVisible()
  await expect(
    canvas.getByRole('button', { name: 'Seleccionar Pedido y resumen', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Dispositivo', { exact: true })).toHaveValue('adaptive')
  await editor.getByLabel('Tema de la terminal', { exact: true }).selectOption('dark')
  await expect(preview).toHaveAttribute('data-studio-theme', 'dark')
  expect((await readApi<{ data: unknown }>(page, 'studio/pos')).data).toBeNull()
  expect(commands).toEqual([])
  await page.evaluate(() => window.dispatchEvent(new Event('nexora:screen-locked')))
  await expect(frame.locator('.pos-terminal')).toHaveCount(0)
})
