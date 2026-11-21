import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Tarifa y zona se configuran en Terminal y se conserva el cargo al guardar domicilio', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await fixtureWorkspace(page, 'Tarifas de prueba')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  await writeApi(page, 'POST', 'tax-profiles', {
    idempotency_key: crypto.randomUUID(),
    name: 'Envío ficticio 8%',
    price_mode: 'exclusive',
    rates: [{ name: 'Tasa de prueba', rate: '8' }],
    is_active: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#d58a16',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza tarifa',
    sku: 'FEE-PIZZA',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/terminal/domicilios/tarifas')
  await page.getByRole('button', { name: 'Configurar tarifa', exact: true }).click()
  const config = page.getByRole('dialog', { name: 'Configurar entrega' })
  await config.getByLabel('Activar tarifas').check()
  await config.getByLabel('Tarifa general (COP)', { exact: true }).fill('3000')
  await config.getByLabel('Envío gratis desde (opcional)', { exact: true }).fill('50000')
  await config
    .getByLabel('Perfil tributario del envío')
    .selectOption({ label: 'Envío ficticio 8%' })
  await config.getByRole('button', { name: 'Guardar tarifa', exact: true }).click()
  await expect(config).toHaveCount(0)
  await page.getByRole('button', { name: 'Agregar zona', exact: true }).click()
  const zone = page.getByRole('dialog', { name: 'Nueva zona' })
  await zone.getByLabel('Nombre de zona').fill('Norte')
  await zone.getByLabel('Tarifa', { exact: true }).fill('5000')
  await zone.getByRole('button', { name: 'Guardar zona', exact: true }).click()
  await expect(zone).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'Norte', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/delivery-tariffs.png' })
  await page.goto('/terminal/domicilios/nuevo')
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  const details = page.getByRole('group', { name: 'Datos del cliente y pedido', exact: true })
  await details.getByLabel('Nombre de quien recibe', { exact: true }).fill('Laura prueba')
  await details.getByLabel('Teléfono del domicilio', { exact: true }).fill('3001234567')
  await details.getByLabel('Dirección de entrega', { exact: true }).fill('Calle de prueba 20')
  await details.getByRole('button', { name: 'Listo · volver al pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza tarifa', exact: true }).click()
  const fee = page.getByRole('region', { name: 'Tarifa de domicilio' })
  await fee.getByLabel('Zona de entrega').selectOption({ label: 'Norte' })
  await expect(page.getByRole('button', { name: 'GUARDAR DOMICILIO', exact: true })).toBeEnabled()
  await expect(fee.locator('.pos-fee-totals')).toContainText('23.400')
  const stored = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && /\/api\/v1\/orders$/.test(response.url()),
  )
  await page.getByRole('button', { name: 'GUARDAR DOMICILIO', exact: true }).click()
  expect((await stored).status()).toBe(201)
  await expect(page.locator('.pos-order-table tbody tr')).toHaveCount(1)
  const { data: orders } = await readApi<{ data: { id: number; delivery_fee_total: string }[] }>(
    page,
    `orders?branch_id=${branches[0].id}`,
  )
  expect(orders).toHaveLength(1)
  expect(orders[0].delivery_fee_total).toBe('5400.0000')
  const { data: quote } = await readApi<{
    data: { total: string; delivery_fee_total: string; tax_amount: string }
  }>(page, `orders/${orders[0].id}/quote?discount_amount=0`)
  expect(quote.total).toBe('23400.0000')
  expect(quote.tax_amount).toBe('400.0000')
  expect(quote.delivery_fee_total).toBe('5400.0000')
})
