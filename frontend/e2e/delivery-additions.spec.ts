import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Order } from '../src/features/operations/types'

test('Domicilio: adiciones en Terminal, reintento exacto y conflicto conservan un pedido y solo envían líneas nuevas', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Adiciones domicilio')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza adicional',
      sku: 'DEL-APPEND',
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
  const item = {
    product_id: product.id,
    product_revision: 2,
    quantity: 1,
    expected_unit_price: '18000',
  }
  const base = (
    await writeApi<{ data: Order }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'delivery',
      currency: 'COP',
      customer_name: 'Ana adicionales',
      delivery: {
        recipient_name: 'Ana adicionales',
        phone: '3001234567',
        address: 'Calle principal número 20',
      },
      items: [item],
    })
  ).data
  await writeApi(page, 'POST', `orders/${base.id}/kitchen-dispatch`, {
    idempotency_key: crypto.randomUUID(),
    order_revision: base.revision,
  })
  await page.goto('/terminal/domicilios')
  await page
    .getByRole('button', {
      name: `Ver domicilio de Ana adicionales, pedido #${base.id}`,
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Añadir productos', exact: true }).click()
  const terminal = page.locator('.pos-terminal')
  await expect(terminal.getByText(`Pedido #${base.id}`, { exact: true })).toBeVisible()
  await expect(terminal.getByRole('button', { name: 'Cliente', exact: true })).toBeDisabled()
  await terminal.getByRole('button', { name: 'Agregar Pizza adicional', exact: true }).click()
  const bodies: unknown[] = []
  await page.route(
    '**/api/v1/orders',
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      bodies.push(route.request().postDataJSON())
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await terminal.getByRole('button', { name: 'ACTUALIZAR DOMICILIO', exact: true }).click()
  await expect(
    terminal.getByRole('button', { name: 'Reintentar guardado', exact: true }),
  ).toBeVisible()
  await expect(
    terminal.getByRole('button', { name: 'Volver a domicilios', exact: true }),
  ).toBeDisabled()
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/orders'))
      bodies.push(request.postDataJSON())
  })
  await terminal.getByRole('button', { name: 'Reintentar guardado', exact: true }).click()
  await expect(
    terminal.getByRole('button', { name: 'ACTUALIZAR DOMICILIO', exact: true }),
  ).toBeDisabled()
  await expect.poll(() => bodies.length).toBe(2)
  await expect(
    terminal.getByRole('button', { name: 'Volver a domicilios', exact: true }),
  ).toBeEnabled()
  expect(bodies[0]).toEqual(bodies[1])
  const getOrder = async () => (await readApi<{ data: Order }>(page, `orders/${base.id}`)).data
  const first = await getOrder()
  expect(first.items).toHaveLength(2)
  expect(first.subtotal).toBe('36000.0000')
  expect(first.items![0]).toEqual(base.items![0])
  await terminal.getByRole('button', { name: 'Agregar Pizza adicional', exact: true }).click()
  await writeApi(page, 'POST', 'orders', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    channel: 'delivery',
    currency: 'COP',
    append_order_id: first.id,
    order_revision: first.revision,
    delivery_revision: first.delivery_revision,
    items: [item],
  })
  await terminal.getByRole('button', { name: 'ACTUALIZAR DOMICILIO', exact: true }).click()
  await terminal
    .getByRole('button', { name: 'Actualizar pedido conservando adiciones', exact: true })
    .click()
  await expect(
    terminal.getByRole('button', { name: 'ACTUALIZAR DOMICILIO', exact: true }),
  ).toBeEnabled()
  await terminal.getByRole('button', { name: 'ACTUALIZAR DOMICILIO', exact: true }).click()
  await expect(
    terminal.getByRole('button', { name: 'ACTUALIZAR DOMICILIO', exact: true }),
  ).toBeDisabled()
  await expect.poll(async () => (await getOrder()).items?.length).toBe(4)
  await expect(
    terminal.getByRole('button', { name: 'Volver a domicilios', exact: true }),
  ).toBeEnabled()
  await terminal.getByRole('button', { name: 'ENVIAR A COCINA', exact: true }).click()
  const kitchen = page.getByRole('dialog', { name: 'Enviar comanda a cocina', exact: true })
  await kitchen.getByRole('button', { name: 'Confirmar envío a cocina', exact: true }).click()
  await expect(kitchen).toHaveCount(0)
  const history = await readApi<{ data: { lines: { order_item_id: number }[] }[] }>(
    page,
    `orders/${base.id}/kitchen-tickets`,
  )
  expect(history.data).toHaveLength(2)
  expect(
    history.data
      .flatMap((ticket) => ticket.lines)
      .map((line) => line.order_item_id)
      .sort(),
  ).toEqual((await getOrder()).items!.map((line) => line.id).sort())
  await terminal.getByRole('button', { name: 'Volver a domicilios', exact: true }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Detalle del domicilio' })
      .getByText('4 unidades', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/terminal\/domicilios$/)
})
