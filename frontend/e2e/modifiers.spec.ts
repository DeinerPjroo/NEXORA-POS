import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Order } from '../src/features/operations/types'
import type { ModifierGroup } from '../src/features/catalog/modifier-types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('modificadores: configurar, separar preparaciones, reintentar y conservar opciones en recibo', async ({
  page,
}) => {
  test.setTimeout(300_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Opciones')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Pizzas',
    color: '#8271FF',
    is_active: true,
  })
  const product = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza opciones',
    sku: 'PIZZA-OPC',
    category_id: category.id,
    sale_price: '100.0050',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'POST', `products/${product.data.id}/variants`, {
    product_revision: 1,
    currency: 'COP',
    name: 'Grande',
    sku: 'PIZZA-G',
    sale_price: '120.0050',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const registers = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  await writeApi(page, 'POST', `cash/registers/${registers.data[0].id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '1000',
    currency: 'COP',
  })
  await page.goto(`/productos/${product.data.id}`)
  await page.getByRole('button', { name: 'Nuevo grupo', exact: true }).click()
  await page.getByLabel('Nombre del grupo', { exact: true }).fill('Extras')
  await page.getByLabel('Mínimo de opciones', { exact: true }).fill('1')
  await page.getByLabel('Máximo de opciones', { exact: true }).fill('2')
  await page.getByLabel('Nombre de opción 1', { exact: true }).fill('Queso inicial')
  await page.getByLabel('Precio adicional de opción 1 (COP)', { exact: true }).fill('2.5050')
  await page.getByRole('button', { name: 'Agregar opción al grupo', exact: true }).click()
  await page.getByLabel('Nombre de opción 2', { exact: true }).fill('Champiñones')
  await page.getByLabel('Precio adicional de opción 2 (COP)', { exact: true }).fill('1.0050')
  const groupPath = `products/${product.data.id}/modifier-groups`
  const groupBodies: string[] = []
  await page.route(`**/api/v1/${groupPath}`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    groupBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (groupBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar grupo', exact: true })).toBeVisible()
  await expect(page.getByLabel('Nombre del grupo', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar grupo', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(groupBodies).toHaveLength(2)
  expect(groupBodies[0]).toBe(groupBodies[1])
  await page.unroute(`**/api/v1/${groupPath}`)
  await expect(page.getByRole('heading', { name: 'Extras', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nuevo grupo', exact: true }).click()
  await page.getByLabel('Nombre del grupo', { exact: true }).fill('Sin ingredientes')
  await page.getByLabel('Tipo de grupo', { exact: true }).selectOption('exclusion')
  await page.getByLabel('Nombre de opción 1', { exact: true }).fill('Sin cebolla')
  await expect(
    page.getByLabel('Precio adicional de opción 1 (COP)', { exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sin ingredientes', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver opciones de Extras', exact: true }).click()
  await page.getByRole('button', { name: 'Editar opción Queso inicial', exact: true }).click()
  await page.getByLabel('Nombre de la opción', { exact: true }).fill('Queso')
  await page.getByRole('button', { name: 'Guardar opción', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar opción Queso', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nueva opción en Sin ingredientes', exact: true }).click()
  await page.getByLabel('Nombre de la opción', { exact: true }).fill('Sin tomate')
  await expect(page.getByLabel('Precio adicional (COP)', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar opción', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const config = await readApi<{ data: ModifierGroup[]; product_revision: number }>(
    page,
    `products/${product.data.id}/modifier-configuration`,
  )
  expect(config.product_revision).toBe(6)
  expect(config.data).toHaveLength(2)
  const cheese = config.data[0].options![0]
  await page.goto('/pedidos/nuevo')
  async function personalize(cheeseOption: boolean, withoutOnion: boolean) {
    await page.getByRole('button', { name: 'Agregar Pizza opciones', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Elige la presentación · Pizza opciones', exact: true })
      .getByRole('button', { name: /Grande/ })
      .click()
    const dialog = page.getByRole('dialog', {
      name: 'Personaliza · Pizza opciones · Grande',
      exact: true,
    })
    await expect(
      dialog.getByRole('button', { name: 'Agregar con estas opciones', exact: true }),
    ).toBeDisabled()
    await expect(dialog.getByRole('checkbox', { name: /Queso/ })).not.toBeChecked()
    await dialog.getByRole('checkbox', { name: cheeseOption ? /Queso/ : /Champiñones/ }).check()
    if (withoutOnion) await dialog.getByRole('checkbox', { name: /Sin cebolla/ }).check()
    return dialog
  }
  const dialog = await personalize(true, true)
  await expect(
    dialog.locator('.checkout-change').getByText(formatMoney('122.51'), { exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 1000 })
  mkdirSync('../docs/screenshots', { recursive: true })
  await dialog.evaluate((node) => node.scrollTo(0, 0))
  await page.screenshot({
    path: '../docs/screenshots/modifier-picker-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await (
    await personalize(false, false)
  )
    .getByRole('button', { name: 'Agregar con estas opciones', exact: true })
    .click()
  await expect(page.locator('.cart-line')).toHaveCount(2)
  await (
    await personalize(true, true)
  )
    .getByRole('button', { name: 'Agregar con estas opciones', exact: true })
    .click()
  await expect(page.locator('.cart-line')).toHaveCount(2)
  await expect(
    page.locator('.order-subtotal').getByText(formatMoney('366.03'), { exact: true }),
  ).toBeVisible()
  const orderBodies: string[] = []
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    orderBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (orderBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
  await writeApi(page, 'PUT', `${groupPath}/${config.data[0].id}/options/${cheese.id}`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 6,
    currency: 'COP',
    name: 'Queso renombrado',
    extra_price: '99',
    is_active: false,
    position: 0,
  })
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  expect(orderBodies).toHaveLength(2)
  expect(orderBodies[0]).toBe(orderBodies[1])
  await page.unroute('**/api/v1/orders')
  const orderId = page.url().split('/').at(-1)!
  const order = (await readApi<{ data: Order }>(page, `orders/${orderId}`)).data
  expect(order.subtotal).toBe('366.0300')
  expect(order.items).toHaveLength(2)
  expect(order.items![0].quantity).toBe(2)
  expect(order.items![0].unit_price).toBe('122.5100')
  expect(order.items![0].modifiers_snapshot![0].options[0].name).toBe('Queso')
  await expect(page.locator('.saved-order-item').first()).toContainText('Sin cebolla')
  await expect(page.locator('.saved-order-item').first()).not.toContainText('Queso renombrado')
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await expect(page.locator('.checkout-summary')).toContainText('Sin cebolla')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('400')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText('Sin cebolla')
  await expect(page.getByRole('article')).not.toContainText('Queso renombrado')
  await page.screenshot({
    path: '../docs/screenshots/modifier-receipt-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/modifier-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})
