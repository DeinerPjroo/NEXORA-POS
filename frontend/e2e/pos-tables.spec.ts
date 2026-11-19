import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('POS: Mesas abre salones, ocupa y selecciona conservando el pedido', async ({ page }) => {
  test.setTimeout(120_000)
  await fixtureWorkspace(page, 'Mesas desde POS')
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
    name: 'Mesa POS',
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
    name: 'Pizza de prueba',
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
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Pizza de prueba', exact: true }).click()
  await expect(page.locator('.cart-lines')).toContainText('Pizza de prueba')
  const lines = page.getByRole('table', { name: 'Líneas del pedido', exact: true })
  await expect(lines.getByRole('columnheader', { name: 'Cant.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sumar Pizza de prueba', exact: true }).click()
  await expect(lines.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('2')
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Mesas del terminal', exact: true })
  await expect(picker).toHaveClass(/pos-tables-drawer/)
  const actions = await page.locator('.pos-actions').boundingBox()
  const drawer = await picker.boundingBox()
  expect(drawer!.x).toBeGreaterThanOrEqual(actions!.x + actions!.width)
  expect(drawer!.width).toBeGreaterThan(page.viewportSize()!.width / 2)
  await expect(picker.getByRole('button', { name: 'Salón POS', exact: true })).toBeVisible()
  await picker.getByRole('button', { name: 'Ocupar Mesa POS', exact: true }).click()
  const opening = page.getByRole('dialog', { name: 'Ocupar mesas', exact: true })
  await opening.getByRole('button', { name: 'Guardar atención', exact: true }).click()
  await expect(picker).toHaveCount(0)
  await expect(page.locator('.pos-dining-selection')).toContainText('Mesa POS')
  await expect(page.locator('.cart-lines')).toContainText('Pizza de prueba')
  // Una mesa ocupada se puede volver a elegir sin crear otra atención.
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await picker.getByRole('button', { name: 'Seleccionar Mesa POS', exact: true }).click()
  await expect(picker).toHaveCount(0)
  const { data: sessions } = await readApi<{ data: { id: number }[] }>(
    page,
    `dining-sessions?status=open&branch_id=${branch}`,
  )
  expect(sessions).toHaveLength(1)
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await page.waitForURL(/\/pos\/pedidos\/\d+\/cobrar$/)
  const orderId = page.url().match(/pedidos\/(\d+)/)![1]
  const { data: order } = await readApi<{
    data: {
      channel: string
      dining_session_id: number
      items: { quantity: number }[]
      subtotal: string
    }
  }>(page, 'orders/' + orderId)
  expect(order.channel).toBe('dine_in')
  expect(order.dining_session_id).toBe(sessions[0].id)
  expect(order.items[0].quantity).toBe(2)
  expect(order.subtotal).toBe('36000.0000')
})
