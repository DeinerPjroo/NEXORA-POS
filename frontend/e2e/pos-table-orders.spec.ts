import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
test('POS: guarda por mesa al cambiar, reintenta sin duplicar y recupera solo sus pedidos', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await fixtureWorkspace(page, 'Pedidos por mesa')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const branch = branches[0].id
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    name: 'Salón POS',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', `dining-rooms/${room.id}/tables`, {
    idempotency_key: crypto.randomUUID(),
    room_revision: 1,
    name: 'Mesa 1',
    shape: 'square',
    color: '#258ca7',
    capacity: 4,
    is_active: true,
  })
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta de mesas',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Picada de prueba',
    sku: 'MESA-PIZZA',
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
    opening_amount: '0',
    currency: 'COP',
  })

  await writeApi(page, 'POST', `dining-rooms/${room.id}/tables`, {
    idempotency_key: crypto.randomUUID(),
    room_revision: 2,
    name: 'Mesa 2',
    shape: 'square',
    color: '#258ca7',
    capacity: 4,
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Hamburguesa de prueba',
    sku: 'MESA-HAMBURGUESA',
    category_id: category.id,
    sale_price: '22000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Picada de prueba', exact: true }).click()
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  const picker = page.getByRole('region', { name: 'Mesas del terminal', exact: true })
  await picker.getByRole('button', { name: 'Ocupar Mesa 1', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Ocupar mesas', exact: true })
    .getByRole('button', { name: 'Guardar atención', exact: true })
    .click()
  await expect(page.locator('.pos-dining-selection')).toContainText('Mesa 1')
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
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await picker.getByRole('button', { name: 'Ocupar Mesa 2', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Ocupar mesas', exact: true })
    .getByRole('button', { name: 'Guardar atención', exact: true })
    .click()
  await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click()
  await expect(page.locator('.pos-dining-selection')).toContainText('Mesa 2')
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  await page.unroute('**/api/v1/orders')
  const saved = page.getByRole('table', { name: 'Líneas del pedido', exact: true })
  await expect(page.locator('.cart-empty')).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Pedidos guardados de la mesa', exact: true }),
  ).toHaveCount(0)
  await expect(saved).not.toContainText('Picada de prueba')
  await page.getByRole('button', { name: 'Agregar Hamburguesa de prueba', exact: true }).click()
  await page.getByRole('button', { name: 'GUARDAR EN MESA', exact: true }).click()
  await expect(saved).toContainText('Hamburguesa de prueba')
  await expect(saved).not.toContainText('Picada de prueba')
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await picker.getByRole('button', { name: 'Seleccionar Mesa 1', exact: true }).click()
  await expect(saved).toContainText('Picada de prueba')
  await expect(saved).not.toContainText('Hamburguesa de prueba')
  const headingBefore = await page.locator('.pos-current-order-reference').innerText()
  await page.getByRole('button', { name: 'Agregar Hamburguesa de prueba', exact: true }).click()
  await expect(saved).toContainText('Hamburguesa de prueba')
  await expect(page.locator('.order-subtotal')).toContainText('40.000')
  await page.getByRole('button', { name: 'Agregar Picada de prueba', exact: true }).click()
  const picadaRow = saved.getByRole('row').filter({ hasText: 'Picada de prueba' })
  await expect(picadaRow).toHaveCount(1)
  await expect(picadaRow.getByRole('cell').first()).toHaveText('2')
  await expect(page.locator('.order-subtotal')).toContainText('58.000')
  await page.getByRole('button', { name: 'ACTUALIZAR PEDIDO', exact: true }).click()
  await expect(page.locator('.pos-line-actions')).toHaveCount(0)
  await expect(saved).toContainText('Hamburguesa de prueba')
  await expect(page.locator('.pos-current-order-reference')).toHaveText(headingBefore)
  await expect(picadaRow.getByRole('cell').first()).toHaveText('2')
  await expect(page.locator('.order-subtotal')).toContainText('58.000')
  await page.reload()
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await picker.getByRole('button', { name: 'Seleccionar Mesa 1', exact: true }).click()
  await expect(saved).toContainText('Picada de prueba')
  await expect(saved).toContainText('Hamburguesa de prueba')
  await expect(picadaRow.getByRole('cell').first()).toHaveText('2')
  await expect(page.locator('.order-subtotal')).toContainText('58.000')
  const { data: sessions } = await readApi<{
    data: { id: number; tables: { table_name: string }[] }[]
  }>(page, `dining-sessions?branch_id=${branch}&status=open`)
  for (const [name, product] of [
    ['Mesa 1', 'Picada de prueba'],
    ['Mesa 2', 'Hamburguesa de prueba'],
  ]) {
    const session = sessions.find((item) => item.tables.some((table) => table.table_name === name))!
    const { data: orders } = await readApi<{ data: { items: { product_name: string }[] }[] }>(
      page,
      `dining-sessions/${session.id}/orders`,
    )
    expect(orders).toHaveLength(1)
    expect(orders[0].items[0].product_name).toBe(product)
    expect(orders[0].items).toHaveLength(name === 'Mesa 1' ? 3 : 1)
  }
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  const checkout = page.getByRole('dialog', { name: 'Cobro en terminal', exact: true })
  await expect(checkout).toBeVisible()
  await expect(
    checkout.getByRole('heading', {
      name: 'Cobrar pedido #' + headingBefore.replace(/\D/g, ''),
      exact: true,
    }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/pos$/)
  await checkout.getByRole('button', { name: 'Volver al pedido', exact: true }).click()
  await expect(checkout).toHaveCount(0)
  await expect(saved).toContainText('Picada de prueba')
  await expect(picadaRow.getByRole('cell').first()).toHaveText('2')
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(checkout).toBeVisible()
})
