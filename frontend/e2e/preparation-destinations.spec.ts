import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Mesero abre recogidas y domicilios en Terminal sin acceso al cobro', async ({ page }) => {
  await fixtureWorkspace(page, 'Mesero sin cobro', ['catalog.view', 'orders.view', 'orders.manage'])
  await page.goto('/terminal/domicilios')
  await page.getByRole('link', { name: 'Nuevo domicilio', exact: true }).click()
  await expect(page).toHaveURL(/\/pedidos\/nuevo\?canal=delivery$/)
  await expect(page.locator('.pos-terminal')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await expect(page.getByLabel('Dirección de entrega', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Navegación operativa', exact: true })
    .getByRole('link', { name: 'Para llevar', exact: true })
    .click()
  await expect(page).toHaveURL(/\/terminal\/recogidas$/)
  await expect(page.getByRole('button', { name: 'Nueva recogida', exact: true })).toBeVisible()
  await expect(page.locator('.pos-terminal')).toBeVisible()
})

test('Mesa mixta, recogida y domicilio conservan canales, historial y envíos incrementales', async ({
  page,
}) => {
  test.setTimeout(300_000)
  await fixtureWorkspace(page, 'Destinos operativos')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const branch = branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Pizzas',
    color: '#7258df',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza mixta',
    sku: 'MIXTA-PREP',
    category_id: category.id,
    sale_price: '20000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
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
    product_revision: 1,
    kitchen_station_id: station.id,
    is_active: true,
  })
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    name: 'Salón',
    color: '#7258df',
    is_active: true,
  })
  const { data: table } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `dining-rooms/${room.id}/tables`,
    {
      idempotency_key: crypto.randomUUID(),
      room_revision: 1,
      name: 'Mesa mixta',
      shape: 'square',
      color: '#258ca7',
      capacity: 4,
      is_active: true,
    },
  )
  const { data: session } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    'dining-sessions',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      tables: [{ id: table.id, revision: 1 }],
      guest_count: 2,
      waiter_id: null,
    },
  )
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const { data: registers } = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  const { data: cash } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${registers[0].id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '100', currency: 'COP' },
  )
  async function send() {
    await page.getByRole('button', { name: 'ENVIAR A COCINA', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Enviar comanda a cocina', exact: true })
    await modal.getByRole('button', { name: 'Confirmar envío a cocina', exact: true }).click()
    await expect(modal).toHaveCount(0)
  }
  await page.goto(`/pos/atenciones/${session.id}`)
  await page.getByRole('button', { name: 'Agregar Pizza mixta', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Pizza mixta', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Pizza mixta', exact: true }).click()
  await page.getByRole('button', { name: 'Separar destino', exact: true }).click()
  const split = page.getByRole('dialog', { name: 'Separar cantidades por destino', exact: true })
  await split.getByLabel('Cantidad a separar', { exact: true }).fill('1')
  await split.getByRole('button', { name: 'Separar cantidad', exact: true }).click()
  await expect(page.locator('.pos-order-table tbody tr')).toHaveCount(2)
  await send()
  const { data: orders } = await readApi<{ data: { id: number; subtotal: string }[] }>(
    page,
    'orders',
  )
  expect(orders).toHaveLength(1)
  expect(orders[0].subtotal).toBe('60000.0000')
  await page.getByRole('button', { name: 'Comandas de esta mesa', exact: true }).click()
  const history = page.getByRole('dialog', { name: 'Comandas de esta mesa', exact: true })
  await expect(history).toContainText('Servir en mesa')
  await expect(history).toContainText('Empacar')
  await history.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza mixta', exact: true }).click()
  await send()
  const { data: updated } = await readApi<{ data: { id: number; subtotal: string }[] }>(
    page,
    'orders',
  )
  expect(updated).toHaveLength(1)
  expect(updated[0]).toMatchObject({ id: orders[0].id, subtotal: '80000.0000' })
  const { data: tickets } = await readApi<{
    data: { id: number; revision: number; lines: unknown[] }[]
  }>(page, `kitchen-tickets?branch_id=${branch}`)
  expect(tickets).toHaveLength(2)
  expect(tickets.reduce((n, t) => n + t.lines.length, 0)).toBe(3)
  await page
    .locator('.pos-order-table tbody tr')
    .filter({ hasText: 'Servir en mesa' })
    .getByRole('button', { name: 'Corregir destino registrado', exact: true })
    .click()
  const correction = page.getByRole('dialog', { name: 'Corregir destino registrado', exact: true })
  await correction.getByLabel('Nuevo destino', { exact: true }).selectOption('takeaway')
  await correction
    .getByLabel('Motivo de la corrección', { exact: true })
    .fill('Cliente quiere empacar lo restante')
  await correction.getByRole('button', { name: 'Registrar corrección', exact: true }).click()
  await expect(correction).toHaveCount(0)
  await page.goto('/terminal/cocina')
  await expect(
    page.locator('.kitchen-ticket').filter({ hasText: 'Cliente quiere empacar lo restante' }),
  ).toHaveCount(2)
  await page.screenshot({ path: 'test-results/kitchen-preparation-destinations.png' })
  await page.goto('/terminal/recogidas')
  await page.getByRole('button', { name: 'Recogidas', exact: true }).click()
  await expect(page.locator('.pos-pickup-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver al pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza mixta', exact: true }).click()
  await send()
  await page.goto('/terminal/recogidas')
  await page.getByRole('button', { name: 'Recogidas', exact: true }).click()
  await expect(page.locator('.pos-pickup-card')).toHaveCount(1)
  await page.goto('/terminal/domicilios')
  await page.getByRole('link', { name: 'Nuevo domicilio', exact: true }).click()
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await page.getByLabel('Nombre de quien recibe', { exact: true }).fill('Cliente domicilio')
  await page.getByLabel('Teléfono del domicilio', { exact: true }).fill('3001234567')
  await page.getByLabel('Dirección de entrega', { exact: true }).fill('Calle de prueba 123')
  await page.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza mixta', exact: true }).click()
  await send()
  await page.goto('/terminal/domicilios')
  await expect(page.locator('.delivery-card')).toHaveCount(1)
  await expect(page.locator('.delivery-card')).toContainText('Calle de prueba 123')
  const { roles } = await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')
  const { data: courier } = await writeApi<{ data: { id: number } }>(page, 'POST', 'employees', {
    idempotency_key: crypto.randomUUID(),
    name: 'Repartidor de prueba',
    email: `courier-${crypto.randomUUID()}@example.test`,
    role_id: roles.find((r) => r.name === 'Repartidor')!.id,
    is_active: true,
    branch_ids: [branch],
    password: 'RepartidorSeguro123',
    password_confirmation: 'RepartidorSeguro123',
  })
  await page.getByRole('button', { name: 'Asignar repartidor', exact: true }).click()
  const assign = page.getByRole('dialog', { name: 'Asignar repartidor', exact: true })
  await assign.getByLabel('Repartidor autorizado', { exact: true }).selectOption(String(courier.id))
  await assign.getByRole('button', { name: 'Confirmar estado de entrega', exact: true }).click()
  await expect(assign).toHaveCount(0)
  const { data: deliveries } = await readApi<{ data: { order_id: number }[] }>(
    page,
    `deliveries?branch_id=${branch}`,
  )
  const { data: liveTickets } = await readApi<{
    data: { id: number; revision: number; order_id: number }[]
  }>(page, `kitchen-tickets?branch_id=${branch}`)
  const dt = liveTickets.find((t) => t.order_id === deliveries[0].order_id)!
  await writeApi(page, 'POST', `kitchen-tickets/${dt.id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: dt.revision,
    status: 'preparing',
  })
  await writeApi(page, 'POST', `kitchen-tickets/${dt.id}/status`, {
    idempotency_key: crypto.randomUUID(),
    revision: dt.revision + 1,
    status: 'ready',
  })
  await page.getByRole('button', { name: 'Sale a reparto', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Confirmar salida a reparto', exact: true })
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await page.getByRole('button', { name: 'Confirmar entrega al cliente', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Confirmar entrega al cliente', exact: true })
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await expect(page.locator('.delivery-card')).toContainText('Entregado al cliente')
  await page.screenshot({ path: 'test-results/terminal-delivery.png' })
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(3)
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toHaveLength(0)
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('100.0000')
})
