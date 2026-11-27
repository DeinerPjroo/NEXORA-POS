import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Kitchen privado: evento real, reconexion y bloqueo sin depender del polling', async ({
  page,
  context,
  browser,
}) => {
  test.skip(process.env.NEXORA_E2E_REVERB !== '1', 'Requiere servidor Reverb aislado de E2E.')
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await fixtureWorkspace(page, 'Kitchen sincronizada')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const branch = branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7258df',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number; revision: number } }>(
    page,
    'POST',
    'products',
    {
      name: 'Pizza Reverb',
      sku: 'PIZZA-REVERB',
      category_id: category.id,
      sale_price: '18000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    },
  )
  const { data: station } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    'kitchen-stations',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Pizzas',
      color: '#7258df',
      target_minutes: 10,
      is_active: true,
    },
  )
  await writeApi(page, 'POST', 'kitchen-routes', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    product_id: product.id,
    product_revision: product.revision,
    kitchen_station_id: station.id,
    is_active: true,
  })
  // Commands use the same authenticated session from a separate page, without UI invalidation.
  const cashierContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL: 'http://127.0.0.1:5199',
  })
  const cashier = await cashierContext.newPage()
  await cashier.goto('/terminal/recogidas')
  // Suspend only the fallback timer: real events must trigger API reads.
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      original(handler, timeout === 5000 ? 600000 : timeout, ...args)) as typeof setInterval
  })
  await page.goto('/terminal/cocina')
  await expect(page.getByRole('status').filter({ hasText: 'Canal privado conectado' })).toBeVisible(
    { timeout: 30_000 },
  )
  const { data: order } = await writeApi<{ data: { id: number; revision: number } }>(
    cashier,
    'POST',
    'orders',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'takeaway',
      currency: 'COP',
      customer_name: 'Cliente Reverb',
      items: [
        {
          product_id: product.id,
          product_revision: product.revision + 1,
          quantity: 1,
          expected_unit_price: '18000.0000',
          notes: 'Empacar separado',
        },
      ],
    },
  )
  const { data: dispatch } = await writeApi<{
    data: { tickets: { id: number; revision: number }[] }
  }>(cashier, 'POST', `orders/${order.id}/kitchen-dispatch`, {
    idempotency_key: crypto.randomUUID(),
    order_revision: order.revision,
  })
  const card = page.locator('.kitchen-ticket').filter({ hasText: 'Pizza Reverb' })
  await expect(card).toContainText('Empacar separado')
  const priorityPayloads: string[] = []
  await page.route('**/api/v1/kitchen-tickets/*/priority', async (route) => {
    priorityPayloads.push(route.request().postData()!)
    const response = await route.fetch()
    if (priorityPayloads.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await card.getByRole('button', { name: 'Marcar urgente', exact: true }).click()
  const priority = page.getByRole('dialog', { name: 'Marcar comanda urgente', exact: true })
  await priority.getByLabel('Motivo de prioridad').fill('Cliente requiere salida pronta')
  await priority.getByRole('button', { name: 'Confirmar prioridad', exact: true }).click()
  await expect(
    priority.getByRole('button', { name: 'Reintentar misma prioridad', exact: true }),
  ).toBeVisible()
  await expect(priority.getByRole('button', { name: 'Volver', exact: true })).toBeDisabled()
  await expect(page.locator('.terminal-header')).toHaveAttribute('inert', '')
  await priority.getByRole('button', { name: 'Reintentar misma prioridad', exact: true }).click()
  await expect(priority).toHaveCount(0)
  await expect(page.locator('.terminal-header')).not.toHaveAttribute('inert')
  expect(priorityPayloads).toHaveLength(2)
  expect(priorityPayloads[0]).toBe(priorityPayloads[1])
  await expect(card.locator('.kitchen-urgent')).toHaveText('URGENTE')
  await expect(card.getByRole('button', { name: 'Quitar urgente', exact: true })).toBeVisible()
  await card.getByText('Historial de la comanda', { exact: true }).click()
  await expect(card.locator('details')).toContainText('Cliente requiere salida pronta')
  const identity = await readApi<{ user: { name: string } }>(cashier, 'auth/me')
  await expect(card.locator('details')).toContainText(identity.user.name)
  await context.setOffline(true)
  await expect(page.getByText('Canal privado conectado', { exact: false })).toHaveCount(0, {
    timeout: 30_000,
  })
  await writeApi(cashier, 'POST', `kitchen-tickets/${dispatch.tickets[0].id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: dispatch.tickets[0].revision + 1,
    status: 'preparing',
  })
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: 'Canal privado conectado' })).toBeVisible(
    { timeout: 30_000 },
  )

  await expect(
    page
      .locator('.kitchen-column')
      .filter({ hasText: 'En preparación' })
      .locator('.kitchen-ticket'),
  ).toContainText('Pizza Reverb')
  expect((await readApi<{ data: unknown[] }>(cashier, 'sales')).data).toEqual([])
  await writeApi(page, 'POST', 'auth/screen/lock', {})
  await page.evaluate(() => window.dispatchEvent(new Event('nexora:screen-locked')))
  await expect(page.getByText('Canal privado conectado', { exact: false })).toHaveCount(0)
  await cashierContext.close()
  expect(errors).toEqual([])
})
