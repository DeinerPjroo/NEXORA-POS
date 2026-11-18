import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product } from '../src/features/catalog/types'
import type { ComboComponent } from '../src/features/catalog/combo-types'
import type { Order } from '../src/features/operations/types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('combos fijos: configurar composición, preparar unidades, revisar contexto y conservar recibo', async ({
  page,
}) => {
  test.setTimeout(360_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Combos')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta combos',
    color: '#8271FF',
    is_active: true,
  })
  const profiles: { id: number }[] = []
  for (const [mode, rate] of [
    ['inclusive', '10'],
    ['exclusive', '20'],
  ])
    profiles.push(
      (
        await writeApi<{ data: { id: number } }>(page, 'POST', 'tax-profiles', {
          idempotency_key: crypto.randomUUID(),
          name: `Perfil ${mode}`,
          price_mode: mode,
          rates: [{ name: 'Tasa ficticia', rate }],
          is_active: true,
        })
      ).data,
    )
  const chicken = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name: 'Pollo combo',
      sku: 'POLLO-C',
      category_id: category.id,
      sale_price: '2',
      currency: 'COP',
      tax_profile_id: profiles[0].id,
      tax_profile_revision: 1,
      is_active: true,
      is_available: true,
    })
  ).data
  const drink = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name: 'Bebida combo',
      sku: 'BEBIDA-C',
      category_id: category.id,
      sale_price: '0.5',
      currency: 'COP',
      tax_profile_id: profiles[1].id,
      tax_profile_revision: 1,
      is_active: true,
      is_available: true,
    })
  ).data
  await writeApi(page, 'POST', `products/${drink.id}/variants`, {
    product_revision: 1,
    currency: 'COP',
    name: 'Grande',
    sku: 'BEBIDA-C-G',
    sale_price: '1',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'POST', `products/${chicken.id}/modifier-groups`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 1,
    currency: 'COP',
    name: 'Salsas',
    kind: 'addon',
    min_select: 0,
    max_select: 1,
    is_active: true,
    options: [{ name: 'Salsa especial', extra_price: '0.5050', is_active: true }],
  })
  await page.goto('/productos')
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click()
  await page.getByLabel('Tipo de producto', { exact: true }).selectOption('combo')
  await page.getByLabel('Nombre del producto', { exact: true }).fill('Combo almuerzo')
  await page.getByLabel('Código del producto (SKU)', { exact: true }).fill('COMBO-ALM')
  await page.getByRole('button', { name: 'Categoría: Elegir categoría', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige una categoría', exact: true })
    .getByRole('button', { name: 'Carta combos', exact: true })
    .click()
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('10.0001')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Combo almuerzo', exact: true })).toBeVisible()
  const root = (await readApi<{ data: Product[] }>(page, 'products?kind=combo')).data[0]
  const path = `products/${root.id}`
  const current = async () => (await readApi<{ data: Product }>(page, path)).data
  await page.goto(`/productos/${root.id}`)
  await expect(page.getByRole('button', { name: 'Nueva variante', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Configurar reparto', exact: true }).click()
  await page.getByLabel('Reparto de la base del combo', { exact: true }).selectOption('equal')
  const settingsBodies: string[] = []
  await page.route(`**/api/v1/${path}/combo-settings`, async (route) => {
    settingsBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (settingsBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar reparto', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar reparto', exact: true })).toBeVisible()
  await expect(page.getByLabel('Reparto de la base del combo', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar reparto', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(settingsBodies).toHaveLength(2)
  expect(settingsBodies[0]).toBe(settingsBodies[1])
  await page.unroute(`**/api/v1/${path}/combo-settings`)
  async function chooseComponent(name: string, units: string, position: string, variant?: string) {
    await page.getByRole('button', { name: 'Nuevo componente', exact: true }).click()
    const dialog = page.getByRole('dialog', {
      name: 'Nuevo componente · Combo almuerzo',
      exact: true,
    })
    await dialog.getByRole('button', { name: 'Elegir producto individual', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Elegir producto del componente', exact: true })
    await picker.getByLabel('Buscar componente', { exact: true }).fill(name)
    await picker.getByRole('button', { name: new RegExp(name) }).click()
    if (variant) await dialog.getByRole('button', { name: new RegExp(variant) }).click()
    await dialog.getByLabel('Unidades por combo', { exact: true }).fill(units)
    await dialog.getByLabel('Orden del componente', { exact: true }).fill(position)
    return dialog
  }
  const firstDialog = await chooseComponent('Pollo combo', '2', '0')
  const componentBodies: string[] = []
  await page.route(`**/api/v1/${path}/combo-components`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    componentBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (componentBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await firstDialog.getByRole('button', { name: 'Guardar componente', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar componente', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar componente', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(componentBodies).toHaveLength(2)
  expect(componentBodies[0]).toBe(componentBodies[1])
  await page.unroute(`**/api/v1/${path}/combo-components`)
  await (
    await chooseComponent('Bebida combo', '1', '1', 'Grande')
  )
    .getByRole('button', { name: 'Guardar componente', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.combo-admin')).toContainText(
    '3 unidades en la selección mínima disponible',
  )
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.locator('.combo-admin').screenshot({
    path: '../docs/screenshots/fixed-combo-admin-desktop.png',
    animations: 'disabled',
  })
  await writeApi(page, 'POST', `${path}/context-prices`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current()).revision,
    currency: 'COP',
    channel: 'dine_in',
    amount: '20.0001',
    is_active: true,
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
  await page.getByRole('button', { name: 'Agregar Combo almuerzo', exact: true }).click()
  const comboDialog = page.getByRole('dialog', {
    name: 'Configura el combo · Combo almuerzo',
    exact: true,
  })
  await comboDialog.getByRole('button', { name: 'Elegir preparación · 1', exact: true }).click()
  let prep = page.getByRole('dialog', { name: 'Personaliza · Pollo combo', exact: true })
  await prep.getByRole('checkbox', { name: /Salsa especial/ }).check()
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await comboDialog.getByRole('button', { name: 'Elegir preparación · 2', exact: true }).click()
  prep = page.getByRole('dialog', { name: 'Personaliza · Pollo combo', exact: true })
  await expect(prep.getByRole('checkbox', { name: /Salsa especial/ })).not.toBeChecked()
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await comboDialog.getByLabel('Observación del componente 1', { exact: true }).fill('Bien dorado')
  await comboDialog.getByRole('button', { name: 'Revisar precio del combo', exact: true }).click()
  await expect(comboDialog).toContainText(formatMoney('10.5051'))
  await expect(comboDialog).toContainText('Perfil inclusive')
  await comboDialog.screenshot({
    path: '../docs/screenshots/fixed-combo-picker-desktop.png',
    animations: 'disabled',
  })
  await comboDialog.getByRole('button', { name: 'Agregar combo revisado', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Combo almuerzo', exact: true }).click()
  await page.getByLabel('Observación para Combo almuerzo', { exact: true }).fill('Para compartir')
  await expect(page.locator('.order-subtotal')).toContainText(formatMoney('21.0102'))
  await page.getByLabel('Tipo de pedido', { exact: true }).selectOption('dine_in')
  const review = page.getByRole('dialog', { name: 'Revisar precios del pedido', exact: true })
  await expect(review).toContainText(formatMoney('41.0102'))
  await expect(review).toContainText('Bien dorado')
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
  const component = (
    await readApi<{ data: ComboComponent[] }>(page, `${path}/combo-components`)
  ).data.find((part) => part.component_product_id === chicken.id)!
  await writeApi(page, 'PUT', `${path}/combo-components/${component.id}`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current()).revision,
    revision: component.revision,
    currency: 'COP',
    units: 2,
    position: 0,
    is_active: false,
  })
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  const order = (await readApi<{ data: Order }>(page, `orders/${page.url().split('/').at(-1)!}`))
    .data
  expect(order.items).toHaveLength(3)
  expect(order.combos).toHaveLength(1)
  expect(order.subtotal).toBe('41.0102')
  expect(order.combos![0].quantity).toBe(2)
  await expect(page.locator('.saved-combo')).toContainText('Para compartir')
  await expect(page.locator('.saved-combo .combo-component-line')).toHaveCount(3)
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await expect(page.locator('.checkout-summary .saved-combo')).toContainText('Salsa especial')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('50')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText(formatMoney('43.68'))
  await expect(page.getByRole('article').locator('.saved-combo')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/fixed-combo-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})
