import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Order } from '../src/features/operations/types'
import type { KitchenTicket } from '../src/features/kitchen/types'

test('Domicilio: corregir y retirar productos conserva historia, cocina y reintento sin duplicar', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Cambios de domicilio')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const station = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'kitchen-stations', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Cocina',
      color: '#7255db',
      target_minutes: 12,
      is_active: true,
    })
  ).data
  const items = []
  for (const [name, price, quantity] of [
    ['Pizza', '18000', 2],
    ['Jugo', '9000', 1],
  ] as const) {
    const product = (
      await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
        name,
        sku: name,
        category_id: category.id,
        sale_price: price,
        currency: 'COP',
        is_active: true,
        is_available: true,
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
    items.push({
      product_id: product.id,
      product_revision: 2,
      quantity,
      expected_unit_price: price,
    })
  }
  const order = (
    await writeApi<{ data: Order }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'delivery',
      currency: 'COP',
      customer_name: 'Ana cambios',
      delivery: {
        recipient_name: 'Ana cambios',
        phone: '3001234567',
        address: 'Calle principal número 20',
      },
      items,
    })
  ).data
  await writeApi(page, 'POST', `orders/${order.id}/kitchen-dispatch`, {
    idempotency_key: crypto.randomUUID(),
    order_revision: order.revision,
  })
  await page.goto('/terminal/domicilios')
  await page
    .getByRole('button', { name: `Ver domicilio de Ana cambios, pedido #${order.id}`, exact: true })
    .click()
  const detail = page.getByRole('complementary', { name: 'Detalle del domicilio' })
  await detail.getByRole('button', { name: 'Corregir Pizza', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Corregir producto del domicilio', exact: true })
  await modal.getByLabel('Cantidad que queda', { exact: true }).fill('1')
  await modal.getByLabel('Notas de preparación', { exact: true }).fill('Sin cebolla')
  await modal
    .getByLabel('Motivo del cambio', { exact: true })
    .fill('Cliente reduce cantidad y corrige preparación')
  for (const control of [
    modal.getByLabel('Cantidad que queda', { exact: true }),
    modal.getByLabel('Notas de preparación', { exact: true }),
    modal.getByLabel('Motivo del cambio', { exact: true }),
    modal.getByRole('button', { name: 'Guardar corrección', exact: true }),
  ]) {
    expect(
      await control.evaluate((node) => {
        const r = node.getBoundingClientRect()
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node
      }),
    ).toBe(true)
  }
  await page.screenshot({ path: 'test-results/delivery-item-editor.png' })
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/orders/${order.id}/item-changes`))
      bodies.push(request.postDataJSON())
  })
  await page.route(
    `**/api/v1/orders/${order.id}/item-changes`,
    async (route) => {
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await modal.getByRole('button', { name: 'Guardar corrección', exact: true }).click()
  await expect(
    modal.getByRole('button', { name: 'Reintentar mismo cambio', exact: true }),
  ).toBeVisible()
  await expect(modal.getByLabel('Cantidad que queda', { exact: true })).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled()
  await modal.getByRole('button', { name: 'Reintentar mismo cambio', exact: true }).click()
  await expect(modal).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  const fresh = (await readApi<{ data: Order }>(page, `orders/${order.id}`)).data
  expect(fresh.subtotal).toBe('27000.0000')
  expect(fresh.items).toHaveLength(2)
  expect(fresh.item_changes).toHaveLength(1)
  expect(fresh.items?.find((item) => item.product_name === 'Pizza')?.notes).toBe('Sin cebolla')
  await detail.getByRole('button', { name: 'Corregir Jugo', exact: true }).click()
  await modal.getByRole('button', { name: 'Retirar producto', exact: true }).click()
  await modal.getByLabel('Motivo del cambio', { exact: true }).fill('Cliente retira bebida')
  await modal.getByRole('button', { name: 'Confirmar retiro', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(detail.getByText('1 unidades', { exact: true })).toBeVisible()
  const tickets = (
    await readApi<{ data: KitchenTicket[] }>(page, `orders/${order.id}/kitchen-tickets`)
  ).data
  expect(tickets).toHaveLength(1)
  expect(tickets[0].lines.filter((line) => !line.item_change)).toHaveLength(1)
  expect(tickets[0].lines.filter((line) => line.item_change)).toHaveLength(2)
  await page.goto('/terminal/cocina')
  const changes = page.getByRole('region', { name: 'Cambios recientes de productos', exact: true })
  await expect(changes.getByText(/Cliente retira bebida/)).toBeVisible()
  await expect(changes.getByText(/Cliente reduce cantidad/)).toBeVisible()
  await expect(page.getByText('ANULADO · NO PREPARAR', { exact: true })).toBeVisible()
  await page.goto('/terminal/domicilios')
  await page
    .getByRole('button', { name: `Ver domicilio de Ana cambios, pedido #${order.id}`, exact: true })
    .click()
  await detail.getByRole('button', { name: 'Corregir Pizza', exact: true }).click()
  await modal.getByRole('button', { name: 'Retirar producto', exact: true }).click()
  await modal
    .getByLabel('Motivo del cambio', { exact: true })
    .fill('Cliente cancela resto del pedido')
  await page.setViewportSize({ width: 1024, height: 600 })
  await expect(
    modal.getByRole('button', { name: 'Confirmar retiro', exact: true }),
  ).toBeInViewport()
  await modal.getByRole('button', { name: 'Confirmar retiro', exact: true }).click()
  await expect(modal).toHaveCount(0)
  const cancelled = (await readApi<{ data: Order }>(page, `orders/${order.id}`)).data
  expect(cancelled.status).toBe('cancelled')
  expect(cancelled.delivery_status).toBe('cancelled')
  expect(cancelled.subtotal).toBe('0.0000')
  expect(cancelled.items).toHaveLength(0)
  expect(cancelled.sale_id).toBeNull()
})
