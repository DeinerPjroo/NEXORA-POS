import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Cajero conserva Terminal entre POS, mesas, pedidos y caja; Admin es explícito y autorizado', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  await fixtureWorkspace(page, 'Terminal continua')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const { roles } = await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')
  const branch = branches[0].id
  const email = `cashier-${crypto.randomUUID()}@example.test`
  const password = 'CajeroSeguro123'
  await writeApi(page, 'POST', 'employees', {
    idempotency_key: crypto.randomUUID(),
    name: 'Cajero operativo',
    email,
    role_id: roles.find((r) => r.name === 'Cajero')!.id,
    is_active: true,
    branch_ids: [branch],
    password,
    password_confirmation: password,
  })
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta terminal',
    color: '#7255db',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza operativa',
    sku: 'CONTINUA-PIZZA',
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
  for (let i = 1; i <= 9; i++)
    await writeApi(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'takeaway',
      currency: 'COP',
      reference: `Pedido de prueba ${i}`,
      items: [
        { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '18000' },
      ],
    })
  const cashierContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const cashier = await cashierContext.newPage()
  await cashier.goto('/ingresar')
  await cashier.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await cashier.getByLabel('Contraseña', { exact: true }).fill(password)
  await cashier.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
  await expect(cashier).toHaveURL(/\/pos$/)
  await cashier.goto('/inicio')
  await expect(cashier).toHaveURL(/\/pos$/)
  const header = cashier.locator('.terminal-header')
  const nav = cashier.getByRole('navigation', { name: 'Navegación operativa', exact: true })
  await expect(header).toBeVisible()
  await expect(header.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  await expect(cashier.locator('.sidebar')).toBeHidden()
  const headerBox = await header.boundingBox()
  const posBox = await cashier.locator('.pos-terminal').boundingBox()
  expect(posBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height)
  await nav.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await expect(cashier.locator('.pos-pickup-card')).toHaveCount(9)
  await expect(cashier).toHaveURL(/\/pos$/)
  await expect
    .poll(() =>
      cashier.locator('.terminal-content').evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    )
    .toBe(true)
  await cashier.screenshot({ path: 'test-results/terminal-orders-desktop.png' })
  await cashier.locator('.pos-pickup-card').first().click()
  await expect(header).toBeVisible()
  await expect(cashier).toHaveURL(/\/pos$/)
  await expect(
    cashier.getByRole('region', { name: 'Detalle de pedido en terminal', exact: true }),
  ).toContainText('Pizza operativa')
  await nav.getByRole('link', { name: 'Caja rápida', exact: true }).click()
  await expect(cashier).toHaveURL(/\/caja$/)
  await expect(header).toBeVisible()
  await nav.getByRole('link', { name: 'Mesas', exact: true }).click()
  await expect(cashier).toHaveURL(/\/terminal\/mesas$/)
  await nav.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await cashier.getByRole('link', { name: 'Nuevo pedido', exact: true }).click()
  await expect(cashier).toHaveURL(/\/pos$/)
  await cashier.getByRole('button', { name: 'Agregar Pizza operativa', exact: true }).click()
  await expect(nav.getByRole('link', { name: 'Pedidos', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await nav
    .getByRole('link', { name: 'Pedidos', exact: true })
    .evaluate((el) => (el as HTMLAnchorElement).click())
  await expect(cashier).toHaveURL(/\/pos$/)
  await cashier.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(
    cashier.getByRole('region', { name: 'Cobro en terminal', exact: true }),
  ).toBeVisible()
  await expect(header).toHaveAttribute('inert', '')
  await cashier.getByRole('button', { name: 'Volver al pedido', exact: true }).click()
  await expect(header).not.toHaveAttribute('inert', '')
  await nav.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await expect(cashier.locator('.pos-pickup-card')).toHaveCount(10)
  await cashier.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => cashier.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await cashier.screenshot({ path: 'test-results/terminal-orders-mobile.png' })
  expect(
    (
      await cashier.request.get('/api/v1/workspace/overview', {
        headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
      })
    ).status(),
  ).toBe(403)
  await page.goto('/pos')
  await expect(
    page.locator('.terminal-header').getByRole('link', { name: 'Admin', exact: true }),
  ).toBeVisible()
  await page.locator('.terminal-header').getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio$/)
  await expect(page.locator('.sidebar')).toBeVisible()
  await cashierContext.close()
})
