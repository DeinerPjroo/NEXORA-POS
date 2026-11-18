import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product } from '../src/features/catalog/types'
import type { ComboGroup } from '../src/features/catalog/combo-types'
import type { Order } from '../src/features/operations/types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('alternativas de combo: mínimos, unidades, preparación, contexto, reintento e historia', async ({
  page,
}) => {
  test.setTimeout(360_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Alternativas')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  const leaves: Product[] = []
  for (const [index, name] of ['Pan fijo', 'Pollo elegido', 'Sopa cerrada'].entries()) {
    const profile = (
      await writeApi<{ data: { id: number } }>(page, 'POST', 'tax-profiles', {
        idempotency_key: crypto.randomUUID(),
        name: `Perfil ${name}`,
        price_mode: index === 0 ? 'exclusive' : 'inclusive',
        rates: [{ name: 'Tasa ficticia', rate: index === 0 ? '20' : '10' }],
        is_active: true,
      })
    ).data
    leaves.push(
      (
        await writeApi<{ data: Product }>(page, 'POST', 'products', {
          name,
          sku: `ALT-${index}`,
          category_id: category.id,
          sale_price: '2',
          currency: 'COP',
          tax_profile_id: profile.id,
          tax_profile_revision: 1,
          is_active: true,
          is_available: index !== 2,
        })
      ).data,
    )
  }
  await writeApi(page, 'POST', `products/${leaves[1].id}/modifier-groups`, {
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
  const root = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name: 'Menú a elección',
      sku: 'MENU-ALT',
      kind: 'combo',
      category_id: category.id,
      sale_price: '10.0001',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const path = `products/${root.id}`
  const current = async () => (await readApi<{ data: Product }>(page, path)).data
  await writeApi(page, 'PUT', `${path}/combo-settings`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 1,
    currency: 'COP',
    allocation_mode: 'equal',
  })
  await writeApi(page, 'POST', `${path}/combo-components`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 2,
    currency: 'COP',
    component_product_id: leaves[0].id,
    component_product_revision: 1,
    units: 1,
    position: 0,
    is_active: true,
  })
  await page.goto(`/productos/${root.id}`)
  await page.getByRole('button', { name: 'Nuevo grupo de alternativas', exact: true }).click()
  await page.getByLabel('Nombre del grupo', { exact: true }).fill('Plato principal')
  const groupBodies: string[] = []
  await page.route(`**/api/v1/${path}/combo-groups`, async (route) => {
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
  await page.unroute(`**/api/v1/${path}/combo-groups`)
  for (const [name, units] of [
    ['Pollo elegido', '2'],
    ['Sopa cerrada', '1'],
  ]) {
    await page
      .getByRole('button', { name: 'Agregar alternativa a Plato principal', exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: 'Nuevo componente · Menú a elección',
      exact: true,
    })
    await expect(dialog).toContainText('Alternativa de Plato principal')
    await dialog.getByRole('button', { name: 'Elegir producto individual', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Elegir producto del componente', exact: true })
    await picker.getByLabel('Buscar componente', { exact: true }).fill(name)
    await picker.getByRole('button', { name: new RegExp(name) }).click()
    await dialog.getByLabel('Unidades por combo', { exact: true }).fill(units)
    await dialog.getByRole('button', { name: 'Guardar componente', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Editar grupo Plato principal', exact: true }).click()
  await page.getByLabel('Mínimo de alternativas', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.locator('.combo-admin').screenshot({
    path: '../docs/screenshots/combo-choices-admin-desktop.png',
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
  await page.getByRole('button', { name: 'Agregar Menú a elección', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Configura el combo · Menú a elección',
    exact: true,
  })
  await expect(
    dialog.getByRole('button', { name: 'Revisar precio del combo', exact: true }),
  ).toBeDisabled()
  await expect(dialog.getByRole('checkbox', { name: /Sopa cerrada/ })).toBeDisabled()
  await expect(dialog.getByRole('checkbox', { name: /Pollo elegido/ })).not.toBeChecked()
  await dialog.getByRole('checkbox', { name: /Pollo elegido/ }).check()
  await expect(dialog).toContainText('3 de 20 unidades elegidas')
  await dialog.getByRole('button', { name: 'Elegir preparación · 2', exact: true }).click()
  let prep = page.getByRole('dialog', { name: 'Personaliza · Pollo elegido', exact: true })
  await prep.getByRole('checkbox', { name: /Salsa especial/ }).check()
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await dialog.getByRole('button', { name: 'Elegir preparación · 3', exact: true }).click()
  prep = page.getByRole('dialog', { name: 'Personaliza · Pollo elegido', exact: true })
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await dialog.getByLabel('Observación del componente 2', { exact: true }).fill('Sin picante')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await dialog.screenshot({
    path: '../docs/screenshots/combo-choices-picker-mobile.png',
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Revisar precio del combo', exact: true }).click()
  await expect(dialog).toContainText('Alternativa de Plato principal')
  await expect(dialog).toContainText(formatMoney('10.5051'))
  await dialog.getByRole('button', { name: 'Agregar combo revisado', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('Tipo de pedido', { exact: true }).selectOption('dine_in')
  const review = page.getByRole('dialog', { name: 'Revisar precios del pedido', exact: true })
  await expect(review).toContainText('Sin picante')
  await expect(review).toContainText('Plato principal')
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
  const group = (await readApi<{ data: ComboGroup[] }>(page, `${path}/combo-groups`)).data[0]
  await writeApi(page, 'PUT', `${path}/combo-groups/${group.id}`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current()).revision,
    revision: group.revision,
    currency: 'COP',
    name: 'Plato archivado',
    min_select: 1,
    max_select: 1,
    position: 0,
    is_active: false,
  })
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  expect(JSON.parse(bodies[0]).items[0].selection_version).toBe(2)
  const order = (await readApi<{ data: Order }>(page, `orders/${page.url().split('/').at(-1)!}`))
    .data
  expect(order.items).toHaveLength(3)
  expect(order.combos![0].snapshot.version).toBe(2)
  expect(order.combos![0].snapshot.groups![0].name).toBe('Plato principal')
  await expect(page.locator('.saved-combo')).toContainText('Alternativa de Plato principal')
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('30')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText(formatMoney('21.84'))
  await expect(page.getByRole('article')).toContainText('Plato principal')
  await expect(page.getByRole('article')).not.toContainText('Sopa cerrada')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/combo-choices-receipt-mobile.png',
    animations: 'disabled',
    fullPage: true,
  })
  expect(errors).toEqual([])
})
