import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Recogidas usa POS, conserva el pedido y cobra sin cambiar de pantalla', async ({ page }) => {
  test.setTimeout(180_000)
  await fixtureWorkspace(page, 'Recogidas POS')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Pizzas recogida',
    color: '#7258df',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza recogida',
    sku: 'PICKUP-POS',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const { data: registers } = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  await writeApi(page, 'POST', `cash/registers/${registers[0].id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '100',
    currency: 'COP',
  })
  await page.goto('/terminal/recogidas')
  await expect(page.locator('.pos-terminal')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza recogida', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Agregar Pizza recogida', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recogidas', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Nueva recogida', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'GUARDAR RECOGIDA', exact: true }).click()
  await expect(page.locator('.pos-order-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Nueva recogida', exact: true })).toBeEnabled()
  const { data: orders } = await readApi<{
    data: { id: number; channel: string; subtotal: string }[]
  }>(page, 'orders')
  expect(orders).toHaveLength(1)
  expect(orders[0].channel).toBe('takeaway')
  await page.getByRole('button', { name: 'Nueva recogida', exact: true }).click()
  await expect(page.locator('.pos-order-table tbody tr')).toHaveCount(0)
  await page.getByRole('button', { name: 'Recogidas', exact: true }).click()
  await expect(page.locator('.pos-pickup-card')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza recogida', exact: true }),
  ).toBeDisabled()
  await page.locator('.pos-pickup-card').click()
  await expect(page.locator('.pos-order-table tbody tr')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza recogida', exact: true }),
  ).toBeDisabled()
  await page.screenshot({ path: 'test-results/pickup-terminal.png' })
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  ).toBe(true)
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toBeVisible()
  await expect(page).toHaveURL(/\/terminal\/recogidas$/)
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20000')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect
    .poll(async () => {
      const { data } = await readApi<{ data: { sale_status: string } }>(
        page,
        `orders/${orders[0].id}`,
      )
      return data.sale_status
    })
    .toBe('paid')
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(1)
  expect(errors).toEqual([])
})
