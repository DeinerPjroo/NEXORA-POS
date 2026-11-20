import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Session } from '../src/lib/types'
import { posContextKey } from '../src/features/pos/pos-context'

test('POS: inicio operativo, paneles móviles, atajos y contexto conservado sin confiar en preferencias ajenas', async ({
  page,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Contexto', [
    'catalog.view',
    'catalog.manage',
    'orders.view',
    'orders.manage',
    'sales.collect',
    'sales.configure',
    'sales.view',
    'cash.view',
    'cash.manage',
    'branches.view',
    'branches.manage',
  ])
  await expect(page).toHaveURL(/\/pos$/)
  const deniedOverview = await page.request.get('/api/v1/workspace/overview', {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
  })
  expect(deniedOverview.status()).toBe(403)
  const profile = await readApi<Session>(page, 'auth/me')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    category_id: category.id,
    name: 'Producto contexto',
    sku: 'CTX-POS',
    sale_price: '12.0050',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  const north = await writeApi<{ id: number }>(page, 'POST', 'branches', {
    name: 'Norte de operación',
    code: 'NORTE-CTX',
    is_active: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const registers = (
    await readApi<{ data: { id: number; branch_id: number }[] }>(page, 'cash/registers')
  ).data
  for (const register of registers)
    await writeApi(page, 'POST', `cash/registers/${register.id}/open`, {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '50',
      currency: 'COP',
    })
  await page.goto('/')
  await expect(page).toHaveURL(/\/pos$/)
  await page
    .getByRole('combobox', { name: 'Sucursal de operación', exact: true })
    .selectOption(String(north.id))
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await page.getByLabel('Tipo de pedido', { exact: true }).selectOption('dine_in')
  await page.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Agregar Producto contexto', exact: true }),
  ).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ver menú POS', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Producto contexto', exact: true }).click()
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await page.locator('.pos-line-actions').getByRole('button', { name: 'Nota', exact: true }).click()
  await page
    .getByLabel('Observación para Producto contexto', { exact: true })
    .fill('Nota que permanece')
  await page.getByRole('button', { name: 'Ver menú POS', exact: true }).click()
  await expect(page.locator('.order-cart')).not.toBeVisible()
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await expect(page.getByLabel('Observación para Producto contexto', { exact: true })).toHaveValue(
    'Nota que permanece',
  )
  await page.keyboard.press('F2')
  await expect(page.getByLabel('Buscar en el menú', { exact: true })).toBeFocused()
  await expect(page.locator('.order-menu')).toBeVisible()
  await page.keyboard.press('F8')
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toBeFocused()
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(0)
  mkdirSync('../docs/screenshots', { recursive: true })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page
    .locator('.pos-terminal')
    .screenshot({ path: '../docs/screenshots/pos-context-mobile.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toBeVisible()
  await expect(page.getByText('Nota que permanece', { exact: true })).toBeVisible()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20')
  await page
    .getByRole('region', { name: 'Cobro en terminal' })
    .screenshot({ path: 'test-results/terminal-checkout-mobile.png' })
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('article', { name: /^Recibo / })).toBeVisible()
  await expect(page).toHaveURL(/\/pos$/)
  await page.getByRole('button', { name: 'Nueva operación POS', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Sucursal de operación', exact: true }),
  ).toHaveValue(String(north.id))
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await expect(page.getByLabel('Tipo de pedido', { exact: true })).toHaveValue('dine_in')
  await page.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await expect(page.locator('.cart-empty')).toBeVisible()
  // Preferencia manipulada o sucursal retirada: no iniciar consultas/venta con ese ID.
  const key = posContextKey(profile)
  await page.evaluate(
    (key) => sessionStorage.setItem(key, JSON.stringify({ branchId: 9999999, channel: 'dine_in' })),
    key,
  )
  const forbiddenBranchRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('branch_id=9999999')) forbiddenBranchRequests.push(request.url())
  })
  await page.reload()
  await expect(
    page.getByText(
      'La sucursal recordada ya no está disponible. Elige otra sucursal para continuar.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Sucursal de operación', exact: true }),
  ).toHaveValue('')
  expect(forbiddenBranchRequests).toEqual([])
  await page
    .getByRole('combobox', { name: 'Sucursal de operación', exact: true })
    .selectOption(String(north.id))
  await expect(
    page.getByRole('button', { name: 'Agregar Producto contexto', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/ingresar$/)
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull()
})

test('inicio por permisos: operador de pedidos evita resumen y vuelve a su sección autorizada', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await fixtureWorkspace(page, 'Oliva Pedidos', ['catalog.view', 'orders.view', 'orders.manage'])
  await expect(page).toHaveURL(/\/pedidos$/)
  await page.goto('/inicio')
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.locator('.terminal-header')).toBeVisible()
})

test('inicio sin permisos: información general protegida por sesión sin bucle ni acceso operativo', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await fixtureWorkspace(page, 'Oliva Sin Acceso', [])
  await expect(page).toHaveURL(/\/acerca$/)
  await expect(
    page.getByRole('heading', { name: 'Un espacio para evolucionar.', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Terminal POS', exact: true }),
  ).toHaveCount(0)
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Acceso restringido', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Volver a mi espacio', exact: true }).click()
  await expect(page).toHaveURL(/\/acerca$/)
})
