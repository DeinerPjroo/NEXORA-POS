import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Sale } from '../src/features/sales/types'

test('Domicilios: tablero digital, detalle integrado, reparto real con reintento y cobro sin salir', async ({
  page,
}) => {
  test.setTimeout(240_000)
  page.setDefaultTimeout(20_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Central domicilios')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza a domicilio',
      sku: 'BOARD-DEL',
      category_id: category.id,
      sale_price: '18000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const station = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'kitchen-stations', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Pizzas',
      color: '#7255db',
      target_minutes: 12,
      is_active: true,
    })
  ).data
  await writeApi(page, 'POST', 'kitchen-routes', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    product_id: product.id,
    product_revision: 1,
    kitchen_station_id: station.id,
    is_active: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', `cash/registers/${register.id}/open`, {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '0',
      currency: 'COP',
    })
  ).data
  const { roles } = await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')
  const courier = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'employees', {
      idempotency_key: crypto.randomUUID(),
      name: 'Diego reparto',
      email: `courier-${crypto.randomUUID()}@example.test`,
      role_id: roles.find((r) => r.name === 'Repartidor')!.id,
      is_active: true,
      branch_ids: [branch],
      password: 'RepartidorSeguro123',
      password_confirmation: 'RepartidorSeguro123',
    })
  ).data
  const orders: { id: number; revision: number }[] = []
  for (const [name, address, phone] of [
    ['Ana Norte', 'Carrera 10 número 20', '3001111111'],
    ['Luis Centro', 'Calle 20 número 30', '3002222222'],
    ['Carolina Sur', 'Calle 40 número 50', '3003333333'],
  ]) {
    orders.push(
      (
        await writeApi<{ data: { id: number; revision: number } }>(page, 'POST', 'orders', {
          idempotency_key: crypto.randomUUID(),
          branch_id: branch,
          channel: 'delivery',
          currency: 'COP',
          customer_name: name,
          delivery: {
            recipient_name: name,
            phone,
            address,
            neighborhood: 'Zona de prueba',
            instructions: 'Entregar en portería',
          },
          items: [
            {
              product_id: product.id,
              product_revision: 2,
              quantity: name === 'Ana Norte' ? 2 : 1,
              expected_unit_price: '18000',
              notes: 'Salsa aparte',
            },
          ],
        })
      ).data,
    )
  }
  await page.goto('/terminal/domicilios')
  await expect(page.locator('.delivery-tile')).toHaveCount(3)
  await page
    .getByRole('button', {
      name: `Ver domicilio de Luis Centro, pedido #${orders[1].id}`,
      exact: true,
    })
    .click()
  const detail = page.getByRole('complementary', { name: 'Detalle del domicilio', exact: true })
  await expect(detail.getByRole('heading', { name: 'Luis Centro', exact: true })).toBeVisible()
  await expect(detail.getByRole('table', { name: 'Productos del domicilio' })).toContainText(
    'Pizza a domicilio',
  )
  await expect(detail).toContainText('Calle 20 número 30')
  await page.screenshot({ path: 'test-results/delivery-terminal-desktop.png' })
  await detail.getByRole('button', { name: 'Asignar repartidor', exact: true }).click()
  const assign = page.getByRole('dialog', { name: 'Asignar repartidor', exact: true })
  await assign.getByLabel('Repartidor autorizado', { exact: true }).selectOption(String(courier.id))
  let payload: unknown
  await page.route('**/api/v1/deliveries/*/status', async (route) => {
    payload = route.request().postDataJSON()
    await route.fetch()
    await route.abort('failed')
  })
  await assign.getByRole('button', { name: 'Confirmar estado de entrega', exact: true }).click()
  await expect(assign.getByRole('button', { name: 'Reintentar mismo cambio' })).toBeVisible()
  await expect(assign.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled()
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación operativa' })
      .getByRole('link', { name: 'Mesas', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.unroute('**/api/v1/deliveries/*/status')
  const retried = page.waitForRequest(
    (r) => r.method() === 'POST' && /\/deliveries\/\d+\/status$/.test(r.url()),
  )
  await assign.getByRole('button', { name: 'Reintentar mismo cambio' }).click()
  expect((await retried).postDataJSON()).toEqual(payload)
  await expect(assign).toHaveCount(0)
  await expect(detail).toContainText('Diego reparto')
  await expect(detail.getByRole('button', { name: 'Sale a reparto', exact: true })).toBeDisabled()
  await detail.getByRole('button', { name: 'Enviar a cocina', exact: true }).click()
  const kitchen = page.getByRole('dialog', { name: 'Enviar comanda a cocina', exact: true })
  await kitchen.getByRole('button', { name: 'Confirmar envío a cocina', exact: true }).click()
  await expect(kitchen).toHaveCount(0)
  const ticket = (
    await readApi<{ data: { id: number; revision: number; order_id: number }[] }>(
      page,
      `kitchen-tickets?branch_id=${branch}`,
    )
  ).data.find((t) => t.order_id === orders[1].id)!
  await writeApi(page, 'POST', `kitchen-tickets/${ticket.id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: ticket.revision,
    status: 'preparing',
  })
  await writeApi(page, 'POST', `kitchen-tickets/${ticket.id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: ticket.revision + 1,
    status: 'ready',
  })
  await page.getByRole('button', { name: 'Actualizar domicilios', exact: true }).click()
  await expect(detail.getByRole('button', { name: 'Sale a reparto', exact: true })).toBeEnabled()
  await detail.getByRole('button', { name: 'Sale a reparto', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Confirmar salida a reparto', exact: true })
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await detail.getByRole('button', { name: 'Confirmar entrega al cliente', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Confirmar entrega al cliente', exact: true })
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await expect(detail).toContainText('Entregado al cliente')
  expect((await readApi<{ data: Sale[] }>(page, 'sales')).data).toHaveLength(0)
  await page
    .getByRole('group', { name: 'Filtrar domicilios por estado' })
    .getByRole('button', { name: 'Entregados', exact: true })
    .click()
  await expect(page.locator('.delivery-tile')).toHaveCount(1)
  await page.locator('.delivery-tile').click()
  await detail.getByRole('button', { name: 'Cobrar pedido', exact: true }).click()
  await expect(page).toHaveURL(/\/terminal\/domicilios$/)
  await page.getByRole('button', { name: 'Exacto', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Volver a terminal', exact: true }).click()
  await expect(detail).toContainText('Cobro registrado')
  await expect(detail.getByRole('button', { name: 'Cobrar pedido', exact: true })).toHaveCount(0)
  const sales = (await readApi<{ data: Sale[] }>(page, 'sales')).data
  expect(sales).toHaveLength(1)
  expect((await readApi<{ data: Sale }>(page, `sales/${sales[0].id}`)).data.payments).toHaveLength(
    1,
  )
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('18000.0000')
  await page
    .getByRole('group', { name: 'Filtrar domicilios por estado' })
    .getByRole('button', { name: 'Por asignar', exact: true })
    .click()
  await expect(page.locator('.delivery-tile')).toHaveCount(2)
  await page.getByLabel('Buscar domicilios', { exact: true }).fill('300111')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.locator('.delivery-tile')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.delivery-tile').click()
  await expect(detail.getByRole('heading', { name: 'Ana Norte', exact: true })).toBeVisible()
  await expect(
    detail
      .getByRole('table', { name: 'Productos del domicilio' })
      .getByRole('cell', { name: '2', exact: true }),
  ).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Cobrar pedido', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/delivery-terminal-mobile.png' })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true)
  await detail.getByRole('button', { name: 'Domicilios', exact: true }).click()
  await expect(page.locator('.delivery-tile')).toBeVisible()
  await expect(page.getByLabel('Buscar domicilios', { exact: true })).toHaveValue('300111')
})
