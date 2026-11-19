import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product } from '../src/features/catalog/types'
import type { Promotion } from '../src/features/catalog/promotion-types'
import type { Order } from '../src/features/operations/types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('promociones: administrar, preparar, revisar contexto y conservar precio tras respuesta perdida', async ({
  page,
}) => {
  test.setTimeout(300_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Promociones')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  const profile = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'tax-profiles', {
      idempotency_key: crypto.randomUUID(),
      name: 'Incluido de prueba',
      price_mode: 'inclusive',
      rates: [{ name: 'Tasa ficticia', rate: '10' }],
      is_active: true,
    })
  ).data
  const product = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name: 'Pizza promocional',
      sku: 'PIZZA-P',
      category_id: category.id,
      sale_price: '100.0050',
      currency: 'COP',
      tax_profile_id: profile.id,
      tax_profile_revision: 1,
      is_active: true,
      is_available: true,
    })
  ).data
  const path = `products/${product.id}`
  const current = async () => (await readApi<{ data: Product }>(page, path)).data
  await writeApi(page, 'POST', `${path}/modifier-groups`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 1,
    currency: 'COP',
    name: 'Salsas',
    kind: 'addon',
    min_select: 0,
    max_select: 1,
    is_active: true,
    options: [{ name: 'Salsa completa', extra_price: '0.5050', is_active: true }],
  })
  await writeApi(page, 'POST', `${path}/context-prices`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 2,
    currency: 'COP',
    channel: 'dine_in',
    amount: '200.0050',
    is_active: true,
  })
  await page.goto(`/productos/${product.id}`)
  await page.getByRole('button', { name: 'Nueva promoción', exact: true }).click()
  const editor = page.getByRole('dialog', {
    name: 'Nueva promoción · Pizza promocional',
    exact: true,
  })
  await editor.getByLabel('Nombre de la promoción', { exact: true }).fill('Mitad de la base')
  await editor.getByLabel('Porcentaje promocional', { exact: true }).fill('50')
  await editor.getByLabel('Vigente desde (opcional)', { exact: true }).fill('2020-01-01')
  await editor.getByLabel('Vigente hasta (opcional)', { exact: true }).fill('2099-12-31')
  const promotionBodies: string[] = []
  await page.route(`**/api/v1/${path}/promotions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    promotionBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (promotionBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await editor.getByRole('button', { name: 'Guardar promoción', exact: true }).click()
  await expect(
    editor.getByRole('button', { name: 'Reintentar promoción', exact: true }),
  ).toBeVisible()
  await expect(editor.getByLabel('Porcentaje promocional', { exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Reintentar promoción', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(promotionBodies).toHaveLength(2)
  expect(promotionBodies[0]).toBe(promotionBodies[1])
  await page.unroute(`**/api/v1/${path}/promotions`)
  await expect(page.getByRole('row', { name: /Mitad de la base/ })).toContainText('50 %')
  mkdirSync('../docs/screenshots', { recursive: true })
  await page
    .getByRole('heading', { name: 'Promociones', exact: true })
    .locator('..')
    .locator('..')
    .screenshot({
      path: '../docs/screenshots/promotions-admin-desktop.png',
      animations: 'disabled',
    })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'product',
    tax_name: 'Por producto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const registers = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  await writeApi(page, 'POST', `cash/registers/${registers.data[0].id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '1000',
    currency: 'COP',
  })
  await page.goto('/pedidos/nuevo')
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza promocional', exact: true }),
  ).toContainText('Promoción: Mitad de la base')
  await page.getByRole('button', { name: 'Agregar Pizza promocional', exact: true }).click()
  const prep = page.getByRole('dialog', { name: 'Personaliza · Pizza promocional', exact: true })
  await expect(prep).toContainText('Promoción conservada: Mitad de la base')
  await prep.getByRole('checkbox', { name: /Salsa completa/ }).check()
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Pizza promocional', exact: true }).click()
  await page
    .getByLabel('Observación para Pizza promocional', { exact: true })
    .fill('Conservar salsa y nota')
  await expect(page.locator('.order-subtotal')).toContainText(formatMoney('101.0150'))
  await page.getByLabel('Tipo de pedido', { exact: true }).selectOption('dine_in')
  const review = page.getByRole('dialog', { name: 'Revisar precios del pedido', exact: true })
  await expect(review).toContainText('Mitad de la base')
  await expect(review).toContainText(formatMoney('201.0150'))
  await expect(review).toContainText('Conservar salsa y nota')
  await review.getByRole('button', { name: 'Aplicar precios revisados', exact: true }).click()
  const bodies: string[] = []
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
  const promotion = (await readApi<{ data: Promotion[] }>(page, `${path}/promotions`)).data[0]
  await writeApi(page, 'PUT', `${path}/promotions/${promotion.id}`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current()).revision,
    revision: promotion.revision,
    currency: 'COP',
    expected_timezone: 'America/Bogota',
    name: 'Campaña archivada',
    discount_type: 'percentage',
    discount_value: '99',
    priority: 0,
    valid_from: promotion.valid_from,
    valid_until: promotion.valid_until,
    is_active: false,
  })
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  const order = (await readApi<{ data: Order }>(page, `orders/${page.url().split('/').at(-1)!}`))
    .data
  expect(order.subtotal).toBe('201.0150')
  expect(order.items![0].price_snapshot?.promotion?.name).toBe('Mitad de la base')
  expect(order.items![0].unit_price).toBe('100.5075')
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('250')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText(formatMoney('201.02'))
  await expect(page.getByRole('article')).toContainText('Promoción conservada: Mitad de la base')
  await expect(page.getByRole('article')).toContainText('Salsa completa')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/promotions-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})
