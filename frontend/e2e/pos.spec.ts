import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product } from '../src/features/catalog/types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

async function simpleProduct(page: Parameters<typeof fixtureWorkspace>[0], name = 'Producto POS') {
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta POS',
    color: '#8271FF',
    is_active: true,
  })
  return (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name,
      sku: 'POS-BASE',
      category_id: category.id,
      sale_price: '10.0001',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
}

test('POS: caja y contexto, preparaciones, combo promocional, pedido y cobro inciertos sin duplicar', async ({
  page,
}) => {
  test.setTimeout(300_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Terminal')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const product = await simpleProduct(page, 'Tostada POS')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const north = await writeApi<{ id: number }>(page, 'POST', 'branches', {
    name: 'Norte POS',
    code: 'NORTE-POS',
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
  await writeApi(page, 'PUT', `products/${product.id}`, {
    revision: 1,
    currency: 'COP',
    category_id: product.category_id,
    tax_profile_id: profiles[0].id,
    tax_profile_revision: 1,
    name: product.name,
    sku: product.sku,
    sale_price: '10.0001',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'POST', `products/${product.id}/modifier-groups`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 2,
    currency: 'COP',
    name: 'Preparación',
    kind: 'addon',
    min_select: 0,
    max_select: 1,
    is_active: true,
    options: [{ name: 'Salsa POS', extra_price: '0.5050', is_active: true }],
  })
  const drink = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      category_id: product.category_id,
      tax_profile_id: profiles[1].id,
      tax_profile_revision: 1,
      name: 'Bebida POS',
      sku: 'POS-BEB',
      sale_price: '1',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const variant = (
    await writeApi<{ data: { id: number } }>(page, 'POST', `products/${drink.id}/variants`, {
      product_revision: 1,
      currency: 'COP',
      name: 'Grande POS',
      sku: 'POS-BEB-G',
      sale_price: '2.0001',
      is_active: true,
      is_available: true,
    })
  ).data
  const combo = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      kind: 'combo',
      category_id: product.category_id,
      name: 'Combo POS',
      sku: 'POS-COMBO',
      sale_price: '6.0001',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const comboPath = `products/${combo.id}`
  await writeApi(page, 'PUT', `${comboPath}/combo-settings`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 1,
    currency: 'COP',
    allocation_mode: 'equal',
  })
  await writeApi(page, 'POST', `${comboPath}/combo-components`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 2,
    currency: 'COP',
    component_product_id: product.id,
    component_product_revision: 3,
    units: 1,
    position: 0,
    is_active: true,
  })
  await writeApi(page, 'POST', `${comboPath}/combo-components`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 3,
    currency: 'COP',
    component_product_id: drink.id,
    component_product_revision: 2,
    component_variant_id: variant.id,
    units: 1,
    position: 1,
    is_active: true,
  })
  await writeApi(page, 'POST', `${comboPath}/promotions`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 4,
    expected_timezone: 'America/Bogota',
    currency: 'COP',
    channel: 'all',
    name: 'Combo mitad POS',
    discount_type: 'percentage',
    discount_value: '50',
    priority: 0,
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
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Terminal POS', exact: true })
    .click()
  await expect(page.locator('.terminal-header')).toContainText('NEXORA')
  await page
    .getByRole('combobox', { name: 'Sucursal de operación', exact: true })
    .selectOption(String(branch))
  await page.getByRole('button', { name: 'Caja', exact: true }).click()
  await expect(
    page.getByText('Abre una caja de esta sucursal para iniciar el cobro.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Caja', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Agregar Tostada POS', exact: true }),
  ).toBeDisabled()
  const registers = (
    await readApi<{ data: { id: number; branch_id: number }[] }>(page, 'cash/registers')
  ).data
  const cash = (
    await writeApi<{ data: { id: number } }>(
      page,
      'POST',
      `cash/registers/${registers.find((register) => register.branch_id === branch)!.id}/open`,
      { idempotency_key: crypto.randomUUID(), opening_amount: '100', currency: 'COP' },
    )
  ).data
  await page.getByRole('button', { name: 'Actualizar estado del terminal', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Agregar Tostada POS', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Agregar Tostada POS', exact: true }).click()
  let prep = page.getByRole('dialog', { name: 'Personaliza · Tostada POS', exact: true })
  await prep.getByRole('checkbox', { name: /Salsa POS/ }).check()
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Bebida POS', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Grande POS/ })
    .click()
  await page.getByRole('button', { name: 'Agregar Combo POS', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Configura el combo · Combo POS', exact: true })
  await expect(picker).toContainText('Combo mitad POS')
  await picker.getByRole('button', { name: 'Elegir preparación · 1', exact: true }).click()
  prep = page.getByRole('dialog', { name: 'Personaliza · Tostada POS', exact: true })
  await prep.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await picker.getByRole('button', { name: 'Revisar precio del combo', exact: true }).click()
  await picker.getByRole('button', { name: 'Agregar combo revisado', exact: true }).click()
  await page.getByRole('button', { name: 'Seleccionar Tostada POS', exact: true }).click()
  await page.locator('.pos-line-actions').getByRole('button', { name: 'Nota', exact: true }).click()
  await page.getByLabel('Observación para Tostada POS', { exact: true }).fill('Conservar nota POS')
  await expect(page.locator('.order-subtotal')).toContainText(formatMoney('15.5052'))
  await page
    .getByRole('combobox', { name: 'Sucursal de operación', exact: true })
    .selectOption(String(north.id))
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Observación para Tostada POS', { exact: true })).toHaveValue(
    'Conservar nota POS',
  )
  await page
    .getByRole('combobox', { name: 'Sucursal de operación', exact: true })
    .selectOption(String(branch))
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toBeEnabled()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page
    .locator('.pos-terminal')
    .screenshot({ path: '../docs/screenshots/pos-terminal-desktop.png', animations: 'disabled' })
  const orders: string[] = []
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    orders.push(route.request().postData()!)
    const response = await route.fetch()
    if (orders.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toHaveText(
    'Reintentar envío',
  )
  const originalBranch = (
    await readApi<{ id: number; name: string; code: string }[]>(page, 'branches')
  ).find((item) => item.id === branch)!
  await writeApi(page, 'PUT', `branches/${branch}`, {
    name: originalBranch.name,
    code: originalBranch.code,
    is_active: false,
  })
  await page.getByRole('button', { name: 'Actualizar estado del terminal', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Sucursal de operación', exact: true }),
  ).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toBeEnabled()
  await writeApi(page, 'PUT', `branches/${branch}`, {
    name: originalBranch.name,
    code: originalBranch.code,
    is_active: true,
  })
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toBeVisible()
  await expect(page).toHaveURL(/\/pos$/)
  expect(orders).toHaveLength(2)
  expect(orders[0]).toBe(orders[1])
  expect(
    JSON.parse(orders[0]).items.find(
      (item: { product_id: number }) => item.product_id === product.id,
    ).notes,
  ).toBe('Conservar nota POS')
  await expect(page.getByText('Conservar nota POS', { exact: true })).toBeVisible()
  const collectBodies: string[] = []
  await page.route('**/api/v1/orders/*/collect', async (route) => {
    collectBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (collectBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  const cashKeys = page.getByRole('group', { name: 'Teclado de efectivo', exact: true })
  await cashKeys.getByRole('button', { name: 'Efectivo 2', exact: true }).click()
  await cashKeys.getByRole('button', { name: 'Efectivo 0', exact: true }).click()
  await expect(page.getByLabel('Efectivo recibido', { exact: true })).toHaveValue('20')
  await page
    .getByRole('region', { name: 'Cobro en terminal' })
    .screenshot({ path: 'test-results/terminal-checkout-desktop.png' })
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar cobro', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver al pedido', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar cobro', exact: true }).click()
  await expect(page.getByRole('article', { name: /^Recibo / })).toBeVisible()
  await expect(page).toHaveURL(/\/pos$/)
  expect(collectBodies).toHaveLength(2)
  expect(collectBodies[0]).toBe(collectBodies[1])
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText(formatMoney('16.21'))
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(1)
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toHaveLength(1)
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('116.2100')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.getByRole('button', { name: 'Nueva operación POS', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agregar Tostada POS', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await expect(page.locator('.cart-empty')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page
    .locator('.pos-terminal')
    .screenshot({ path: '../docs/screenshots/pos-terminal-mobile.png', animations: 'disabled' })
  expect(errors).toEqual([])
})

test('POS: rol sin permiso de cobro no ve terminal ni consulta contexto de caja', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await fixtureWorkspace(page, 'Oliva Pedido', [
    'dashboard.view',
    'orders.view',
    'orders.manage',
    'catalog.view',
  ])
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Terminal POS', exact: true }),
  ).toHaveCount(0)
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  const response = await page.request.get('/api/v1/sales/cash-context', {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
  })
  expect(response.status()).toBe(403)
})

test('POS: cobrar sin sales.view muestra recibo local y permite nueva operación', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await fixtureWorkspace(page, 'Oliva Cobro', [
    'dashboard.view',
    'orders.view',
    'orders.manage',
    'catalog.view',
    'catalog.manage',
    'sales.collect',
    'sales.configure',
    'cash.view',
    'cash.manage',
  ])
  await simpleProduct(page)
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const registers = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data
  await writeApi(page, 'POST', `cash/registers/${registers[0].id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '100',
    currency: 'COP',
  })
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Producto POS', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toBeVisible()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20')
  await expect(
    page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }),
  ).toBeEnabled()
  const checkout = page.getByRole('region', { name: 'Cobro en terminal' })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.pos-topbar')).toBeVisible()
  await expect(page.locator('.order-composer')).toBeHidden()
  await checkout.locator('.checkout-form > fieldset').evaluate((form) => {
    form.scrollTop = form.scrollHeight
  })
  await expect
    .poll(async () =>
      checkout.evaluate((dialog) => {
        const total = dialog.querySelector('.digital-pay-total')!.getBoundingClientRect()
        const header = dialog.querySelector('.terminal-checkout-header')!.getBoundingClientRect()
        const confirm = dialog.querySelector('button[type="submit"]')!.getBoundingClientRect()
        const tender = dialog.querySelector('.digital-tender-status')!.getBoundingClientRect()
        return (
          total.top >= header.bottom &&
          total.bottom <= confirm.top &&
          tender.top >= total.top &&
          tender.bottom <= total.bottom
        )
      }),
    )
    .toBe(true)
  await page
    .locator('.pos-terminal')
    .screenshot({ path: 'test-results/checkout-digital-light.png' })
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await page.locator('.pos-terminal').screenshot({ path: 'test-results/checkout-digital-dark.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('V-000001')
  await expect(page.getByRole('article')).toContainText(formatMoney('10'))
  const response = await page.request.get('/api/v1/sales', {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
  })
  expect(response.status()).toBe(403)
  await page.getByRole('button', { name: 'Nueva operación POS', exact: true }).click()
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await expect(page.locator('.cart-empty')).toBeVisible()
})
