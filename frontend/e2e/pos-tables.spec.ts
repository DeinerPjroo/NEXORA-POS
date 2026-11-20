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
  const picker = page.getByRole('region', { name: 'Mesas del terminal', exact: true })
  await expect(picker).toBeVisible()
  const workspace = await page.locator('.pos-order-workspace').boundingBox()
  const panel = await picker.boundingBox()
  const products = await page.locator('.order-menu').boundingBox()
  expect(panel!.x).toBeGreaterThanOrEqual(workspace!.x)
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(workspace!.x + workspace!.width + 1)
  expect(products!.width).toBeLessThan(workspace!.width)
  const keyboard = await page
    .getByRole('region', { name: 'Teclado de cantidad', exact: true })
    .boundingBox()
  expect(keyboard!.width).toBeLessThanOrEqual(products!.width + 1)
  await page
    .getByRole('button', { name: 'Agregar Pizza de prueba', exact: true })
    .click({ trial: true })
  await picker.getByRole('button', { name: 'Volver al pedido', exact: true }).click()
  await expect(lines.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('2')
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Salón POS', exact: true })).toBeVisible()
  await expect(picker.locator('.digital-floor-filters [data-state="available"] strong')).toHaveText(
    '1',
  )
  await expect(picker.locator('.digital-floor-filters [data-state="occupied"] strong')).toHaveText(
    '0',
  )
  await picker.locator('.digital-floor-filters [data-state="occupied"]').click()
  await expect(picker.getByText('No hay mesas para este filtro.', { exact: true })).toBeVisible()
  await picker.locator('.digital-floor-filters [data-state="available"]').click()
  await picker.getByLabel('Buscar mesa', { exact: true }).fill('inexistente')
  await expect(picker.getByRole('button', { name: 'Ocupar Mesa POS', exact: true })).toHaveCount(0)
  await picker.getByLabel('Buscar mesa', { exact: true }).clear()
  await expect(picker.locator('.digital-table-symbol')).toBeVisible()
  await picker.getByRole('button', { name: 'Ocupar Mesa POS', exact: true }).click()
  const opening = page.getByRole('dialog', { name: 'Ocupar mesas', exact: true })
  await expect(opening.getByRole('checkbox')).toHaveCount(0)
  await expect(opening.getByText('Mesa seleccionada: Mesa POS', { exact: true })).toBeVisible()
  await expect(opening.getByLabel('Personas en la atención', { exact: true })).toHaveValue('2')
  await opening.getByRole('button', { name: 'Guardar atención', exact: true }).click()
  await expect(picker).toHaveCount(0)
  await expect(page.locator('.pos-dining-selection')).toContainText('Mesa POS')
  await expect(page.locator('.cart-lines')).toContainText('Pizza de prueba')
  // Una mesa ocupada se puede volver a elegir sin crear otra atención.
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await expect(picker.locator('.digital-floor-filters [data-state="occupied"] strong')).toHaveText(
    '1',
  )
  await picker.getByRole('button', { name: 'Seleccionar Mesa POS', exact: true }).click()
  await expect(picker).toHaveCount(0)
  const { data: sessions } = await readApi<{
    data: {
      id: number
      guest_count: number
      tables: { dining_table_id: number; table_revision: number }[]
    }[]
  }>(page, `dining-sessions?status=open&branch_id=${branch}`)
  expect(sessions).toHaveLength(1)
  expect(sessions[0].guest_count).toBe(2)
  const selectedTable = sessions[0].tables[0]
  const available = await readApi<{ data: { id: number }[] }>(
    page,
    `dining/available-tables?branch_id=${branch}`,
  )
  expect(available.data.some((table) => table.id === selectedTable.dining_table_id)).toBe(false)
  const conflict = await page.request.post('/api/v1/dining-sessions', {
    headers: {
      Origin: 'http://127.0.0.1:5199',
      'X-XSRF-TOKEN': decodeURIComponent(
        (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')!.value,
      ),
    },
    data: {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      tables: [{ id: selectedTable.dining_table_id, revision: selectedTable.table_revision }],
      guest_count: 2,
      waiter_id: null,
      notes: '',
    },
  })
  expect(conflict.status()).toBe(409)
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Cobro en terminal' })).toBeVisible()
  await expect(page).toHaveURL(/\/pos$/)
  const heading = await page.getByRole('heading', { name: /^Cobrar pedido #/ }).innerText()
  const orderId = heading.match(/#(\d+)/)![1]
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
