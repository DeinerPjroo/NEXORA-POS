import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Cobro en reparto y rendicion parcial sin duplicar pagos ante respuesta perdida', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await fixtureWorkspace(page, 'Cobros en reparto')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const role = (await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')).roles.find(
    (r) => r.name === 'Repartidor',
  )!.id
  const { data: courier } = await writeApi<{ data: { id: number } }>(page, 'POST', 'employees', {
    idempotency_key: crypto.randomUUID(),
    name: 'Diego cobros',
    email: `cash-${crypto.randomUUID()}@example.test`,
    role_id: role,
    is_active: true,
    branch_ids: [branch],
    password: 'RepartidorSeguro123',
    password_confirmation: 'RepartidorSeguro123',
  })
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza custodia',
    sku: 'CUSTODIA',
    category_id: category.id,
    sale_price: '100.01',
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
  })
  const { data: order } = await writeApi<{ data: { id: number } }>(page, 'POST', 'orders', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    channel: 'delivery',
    currency: 'COP',
    delivery: { recipient_name: 'Ana cobros', phone: '3001234567', address: 'Calle de prueba 123' },
    items: [
      { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '100.01' },
    ],
  })
  for (const [i, status] of ['preparing', 'ready'].entries())
    await writeApi(page, 'POST', `orders/${order.id}/status`, {
      idempotency_key: crypto.randomUUID(),
      revision: i + 1,
      status,
    })
  const delivery = (
    await readApi<{ data: { id: number; order_id: number }[] }>(
      page,
      `deliveries?branch_id=${branch}`,
    )
  ).data.find((d) => d.order_id === order.id)!
  await writeApi(page, 'POST', `deliveries/${delivery.id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: 1,
    status: 'assigned',
    courier_id: courier.id,
  })
  await writeApi(page, 'POST', `deliveries/${delivery.id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: 2,
    status: 'out_for_delivery',
  })
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.goto('/terminal/domicilios')
  await page
    .getByRole('button', { name: `Ver domicilio de Ana cobros, pedido #${order.id}`, exact: true })
    .click()
  await page.getByRole('button', { name: 'Cobrar efectivo con repartidor', exact: true }).click()
  const checkout = page.getByRole('region', { name: 'Cobro en efectivo con repartidor' })
  await expect(checkout).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const keys = checkout.getByRole('group', { name: 'Teclado de efectivo' }).getByRole('button')
  await expect(keys).toHaveCount(13)
  for (const key of await keys.all()) {
    const bounds = await key.boundingBox()
    expect(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 600).toBeTruthy()
    await key.click({ trial: true })
  }
  await checkout.getByLabel('Efectivo recibido por el repartidor', { exact: true }).fill('110')
  await checkout.getByLabel('Observación del cobro').fill('Cobro confirmado por repartidor')
  await checkout.getByRole('checkbox').check()
  const payloads: string[] = []
  await page.route('**/api/v1/deliveries/*/collect-courier', async (route) => {
    payloads.push(route.request().postData()!)
    const response = await route.fetch()
    if (payloads.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await checkout.getByRole('button', { name: 'Confirmar cobro en custodia' }).click()
  await expect(checkout.getByRole('button', { name: 'Reintentar mismo cobro' })).toBeVisible()
  await expect(checkout.getByRole('button', { name: 'Volver a domicilios' })).toBeDisabled()
  await checkout.getByRole('button', { name: 'Reintentar mismo cobro' }).click()
  await expect(
    checkout.getByText('El efectivo está en custodia del repartidor.', { exact: false }),
  ).toBeVisible()
  expect(payloads).toHaveLength(2)
  expect(payloads[0]).toBe(payloads[1])
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toHaveLength(1)
  await checkout.getByRole('button', { name: 'Volver a domicilios' }).click()
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0].id
  const { data: cash } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${register}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  await page.getByRole('button', { name: 'Rendir cobros', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Rendición de cobros de reparto' })
  await modal.getByRole('button', { name: /Diego cobros/ }).click()
  await modal.getByLabel('Caja que recibe la rendición').selectOption(String(cash.id))
  await modal.getByLabel('Importe recibido en caja').fill('30')
  await modal.getByLabel('Motivo de la rendición').fill('Entrega parcial de efectivo')
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Confirmar ingreso a caja' }).click()
  await expect(modal.getByRole('button', { name: /Diego cobros/ })).toBeVisible()
  const collections = await readApi<{ data: { pending: string }[] }>(
    page,
    `deliveries/collections?branch_id=${branch}`,
  )
  expect(collections.data[0].pending).toBe('70.0100')
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('1030.0000')
  await modal.getByRole('button', { name: /Diego cobros/ }).click()
  await modal.getByLabel('Operación con el efectivo').selectOption('refund')
  await expect(modal.getByLabel('Caja que recibe la rendición')).toHaveCount(0)
  await modal.getByLabel('Importe devuelto al cliente').fill('40')
  await modal.getByLabel('Motivo de la devolución').fill('Devolucion fisica confirmada')
  await modal.getByRole('checkbox').check()
  const refunds: string[] = []
  await page.route('**/api/v1/deliveries/collections/*/refund', async (route) => {
    refunds.push(route.request().postData()!)
    const response = await route.fetch()
    if (refunds.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await modal.getByRole('button', { name: 'Confirmar devolución desde repartidor' }).click()
  await expect(modal.getByRole('button', { name: 'Reintentar misma devolución' })).toBeVisible()
  await expect(modal.getByLabel('Operación con el efectivo')).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Volver a cobros pendientes' })).toBeDisabled()
  await modal.getByRole('button', { name: 'Reintentar misma devolución' }).click()
  await expect(modal.getByRole('button', { name: /Diego cobros/ })).toBeVisible()
  expect(refunds).toHaveLength(2)
  expect(refunds[0]).toBe(refunds[1])
  expect(
    (
      await readApi<{ data: { pending: string }[] }>(
        page,
        `deliveries/collections?branch_id=${branch}`,
      )
    ).data[0].pending,
  ).toBe('30.0100')
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('1030.0000')
  expect(errors).toEqual([])
})
