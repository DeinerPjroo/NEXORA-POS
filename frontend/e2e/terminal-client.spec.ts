import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Cliente integrado en Terminal conserva los campos y los registra en la recogida', async ({
  page,
}) => {
  await fixtureWorkspace(page, 'Cliente táctil', [
    'catalog.view',
    'catalog.manage',
    'orders.view',
    'orders.manage',
  ])
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta cliente',
    color: '#7258df',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza cliente',
    sku: 'CLIENT-POS',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/terminal/recogidas')
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  const panel = page.getByRole('group', { name: 'Datos del cliente y pedido', exact: true })
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel('Nombre del cliente', { exact: true })).toBeFocused()
  await panel.getByLabel('Nombre del cliente', { exact: true }).fill('Laura Gómez')
  await panel.getByLabel('Referencia del pedido', { exact: true }).fill('3001234567')
  await panel.getByLabel('Observación general', { exact: true }).fill('Empacar salsas aparte')
  await expect(
    panel.getByRole('button', { name: 'Listo · volver al pedido', exact: true }),
  ).toBeInViewport()
  await page.screenshot({ path: 'test-results/terminal-client-desktop.png' })
  await panel.getByRole('button', { name: 'Listo · volver al pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await expect(panel.getByLabel('Nombre del cliente', { exact: true })).toHaveValue('Laura Gómez')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Cerrar detalles', exact: true })).toBeInViewport()
  await expect(
    panel.getByRole('button', { name: 'Listo · volver al pedido', exact: true }),
  ).toBeInViewport()
  await page.screenshot({ path: 'test-results/terminal-client-mobile.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await panel.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza cliente', exact: true }).click()
  await page.getByRole('button', { name: 'GUARDAR RECOGIDA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Nueva recogida', exact: true })).toBeEnabled()
  const { data: orders } = await readApi<{
    data: { customer_name: string; reference: string; notes: string }[]
  }>(page, 'orders')
  expect(orders).toHaveLength(1)
  expect(orders[0]).toMatchObject({
    customer_name: 'Laura Gómez',
    reference: '3001234567',
    notes: 'Empacar salsas aparte',
  })
  await expect(page.locator('.pos-dining-selection strong')).toHaveText('Laura Gómez')
  await expect(page.locator('.pos-dining-selection')).toContainText('Referencia: 3001234567')
  await page.getByRole('button', { name: 'Recogidas', exact: true }).click()
  const card = page.locator('.pos-pickup-card')
  await expect(card.locator('strong')).toHaveText('Laura Gómez')
  await expect(card).toContainText('Referencia: 3001234567')
  await page.setViewportSize({ width: 390, height: 844 })
  const cardBox = await card.boundingBox()
  const lastFieldBox = await card.locator('small').last().boundingBox()
  expect(lastFieldBox!.y + lastFieldBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height)
  await page.screenshot({ path: 'test-results/terminal-orders-cards.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await card.click()
  await expect(page.locator('.pos-dining-selection strong')).toHaveText('Laura Gómez')
  await expect(page.locator('.pos-dining-selection')).toContainText('Referencia: 3001234567')
})
