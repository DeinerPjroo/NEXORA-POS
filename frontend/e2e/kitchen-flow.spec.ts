import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Kitchen: configurar ruta, enviar POS sin duplicar, tiempos y estados sobre el pedido real', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(20_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Cocina operativa')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Pizzas',
    color: '#7258df',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza Kitchen',
    sku: 'KITCHEN-PIZZA',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/cocina/estaciones')
  await page.getByRole('button', { name: 'Nueva estación', exact: true }).click()
  await page.getByLabel('Nombre de la estación', { exact: true }).fill('Pizzas')
  await page.getByLabel('Sucursal', { exact: true }).selectOption({ index: 1 })
  await page.getByLabel('Tiempo objetivo en minutos').fill('10')
  await page.getByRole('button', { name: 'Guardar estación', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pizzas', exact: true })).toBeVisible()
  await page.goto('/cocina/rutas')
  await page.getByRole('button', { name: 'Asignar producto', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elegir producto para cocina' })
    .getByRole('button', { name: /Pizza Kitchen/ })
    .click()
  await page
    .getByLabel('Estación de preparación', { exact: true })
    .selectOption({ label: 'Pizzas' })
  await page.getByRole('button', { name: 'Guardar ruta', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Editar ruta Pizza Kitchen', exact: true }),
  ).toBeVisible()
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const { data: registers } = await readApi<{ data: { id: number; branch_id: number }[] }>(
    page,
    'cash/registers',
  )
  const { data: cash } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${registers[0].id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '100', currency: 'COP' },
  )
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Pizza Kitchen', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Pizza Kitchen', exact: true }).click()
  await page.locator('.pos-line-actions').getByRole('button', { name: 'Nota', exact: true }).click()
  await page.getByLabel('Observación para Pizza Kitchen', { exact: true }).fill('Sin aceitunas')
  await page.getByRole('button', { name: 'ENVIAR A COCINA', exact: true }).click()
  const send = page.getByRole('dialog', { name: 'Enviar comanda a cocina', exact: true })
  await expect(send).toContainText('2 × Pizza Kitchen')
  await expect(send).toContainText('Pizzas')
  const dispatches: string[] = []
  await page.route('**/api/v1/orders/*/kitchen-dispatch', async (route) => {
    dispatches.push(route.request().postData()!)
    const response = await route.fetch()
    if (dispatches.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await send.getByRole('button', { name: 'Confirmar envío a cocina', exact: true }).click()
  await expect(
    send.getByRole('button', { name: 'Reintentar mismo envío', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(send).toBeVisible()
  await send.getByRole('button', { name: 'Reintentar mismo envío', exact: true }).click()
  await expect(send).toHaveCount(0)
  expect(dispatches).toHaveLength(2)
  expect(dispatches[0]).toBe(dispatches[1])
  const { data: orders } = await readApi<{
    data: { id: number; subtotal: string; revision: number }[]
  }>(page, 'orders')
  expect(orders).toHaveLength(1)
  expect(orders[0].subtotal).toBe('36000.0000')
  const board = await context.newPage()
  await board.goto('/terminal/cocina')
  await expect(
    board.getByRole('heading', { name: 'Comandas de cocina', exact: true }),
  ).toBeVisible()
  const ticket = board.locator('.kitchen-ticket').filter({ hasText: 'Pizza Kitchen' })
  await expect(ticket).toContainText('2 × Pizza Kitchen')
  await expect(ticket).toContainText('Sin aceitunas')
  await expect(ticket).not.toContainText('$')
  const time = await ticket.locator('time').innerText()
  await expect.poll(() => ticket.locator('time').innerText()).not.toBe(time)
  await board.screenshot({ path: 'test-results/kitchen-board-desktop.png' })
  const changes: string[] = []
  await board.route('**/api/v1/kitchen-tickets/*/status', async (route) => {
    changes.push(route.request().postData()!)
    const response = await route.fetch()
    if (changes.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await ticket.getByRole('button', { name: 'RECIBIR', exact: true }).click()
  await expect(
    board.getByRole('button', { name: 'Reintentar mismo cambio', exact: true }),
  ).toBeVisible()
  await board.getByRole('button', { name: 'Reintentar mismo cambio', exact: true }).click()
  await expect(ticket.getByRole('button', { name: 'TERMINAR', exact: true })).toBeEnabled()
  expect(changes).toHaveLength(2)
  expect(changes[0]).toBe(changes[1])
  await ticket.getByRole('button', { name: 'TERMINAR', exact: true }).click()
  await expect(ticket.getByRole('button', { name: 'ENTREGAR', exact: true })).toBeEnabled()
  expect(
    (await readApi<{ data: { status: string } }>(page, `orders/${orders[0].id}`)).data.status,
  ).toBe('ready')
  await ticket.getByRole('button', { name: 'ENTREGAR', exact: true }).click()
  await expect(ticket).toHaveCount(0)
  expect(
    (await readApi<{ data: { status: string } }>(page, `orders/${orders[0].id}`)).data.status,
  ).toBe('delivered')
  await board.getByRole('button', { name: 'Ver historial', exact: true }).click()
  await expect(ticket).toContainText('Sin aceitunas')
  await board.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => board.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  const { data: history } = await readApi<{ data: { lines: unknown[]; events: unknown[] }[] }>(
    page,
    `kitchen-tickets?branch_id=${registers[0].branch_id}&history=1`,
  )
  expect(history).toHaveLength(1)
  expect(history[0].lines).toHaveLength(1)
  expect(history[0].events).toHaveLength(4)
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toHaveLength(0)
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('100.0000')
  await board.close()
})
