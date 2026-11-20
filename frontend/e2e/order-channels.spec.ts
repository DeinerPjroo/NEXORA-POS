import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Pedidos distingue canales por color y destaca mesa o cliente con filtros reales', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await fixtureWorkspace(page, 'Canales visibles')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const branch = branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta canales',
    color: '#7258df',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza canales',
    sku: 'CHANNEL-01',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    name: 'Salón canales',
    color: '#168bc1',
    is_active: true,
  })
  const { data: table } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `dining-rooms/${room.id}/tables`,
    {
      idempotency_key: crypto.randomUUID(),
      room_revision: 1,
      name: 'Mesa 12',
      shape: 'square',
      color: '#168bc1',
      capacity: 4,
      is_active: true,
    },
  )
  const { data: session } = await writeApi<{ data: { id: number; revision: number } }>(
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
  for (const channel of ['dine_in', 'takeaway', 'delivery']) {
    await writeApi(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel,
      currency: 'COP',
      customer_name:
        channel === 'dine_in'
          ? 'Nombre secundario'
          : channel === 'takeaway'
            ? 'Laura Gómez'
            : 'Carlos Ríos',
      reference: '3001234567',
      items: [
        { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '18000' },
      ],
      ...(channel === 'dine_in'
        ? { dining_session_id: session.id, dining_session_revision: session.revision }
        : {}),
      ...(channel === 'delivery'
        ? {
            delivery: {
              recipient_name: 'Carlos Ríos',
              phone: '3001234567',
              address: 'Calle 10 número 12-30',
            },
          }
        : {}),
    })
  }
  await page.goto('/pos?canal=dine_in')
  await expect(page.getByRole('button', { name: 'Nota', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cliente', exact: true })).toBeDisabled()
  await page.goto(`/pos/atenciones/${session.id}`)
  await expect(page.getByRole('button', { name: 'Nota', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Cliente', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Nota', exact: true }).click()
  const notes = page.getByRole('group', { name: 'Notas del pedido', exact: true })
  await expect(notes.getByLabel('Observación general', { exact: true })).toBeVisible()
  await expect(notes.getByLabel('Observación general', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  )
  await expect(notes.getByLabel('Nombre del cliente', { exact: true })).toBeHidden()
  await page.goto('/pos?canal=delivery')
  await expect(page.getByRole('button', { name: 'Nota', exact: true })).toBeDisabled()
  await page.goto('/terminal/recogidas')
  await expect(page.getByRole('button', { name: 'Nota', exact: true })).toBeEnabled()
  await page.locator('.pos-actions').getByRole('button', { name: 'Pedidos', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Pedidos del terminal', exact: true })
  const cards = panel.locator('.pos-pickup-card')
  await expect(cards).toHaveCount(3)
  const colors: string[] = []
  for (const [channel, title, label] of [
    ['dine_in', 'Mesa 12', 'Mesa'],
    ['takeaway', 'Laura Gómez', 'Para llevar'],
    ['delivery', 'Carlos Ríos', 'Domicilio'],
  ]) {
    const card = panel.locator(`.pos-pickup-card[data-channel="${channel}"]`)
    await expect(card.locator('.order-identity-title')).toHaveText(title)
    await expect(card.locator('.order-channel-badge')).toHaveText(label)
    colors.push(await card.evaluate((node) => getComputedStyle(node).borderLeftColor))
    expect(
      await card
        .locator('.order-identity-title')
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThan(20)
    const filters = panel.getByRole('group', { name: 'Filtrar tipo de pedido' })
    await filters.getByRole('button', { name: label, exact: true }).click()
    await expect(cards).toHaveCount(1)
    await expect(cards.locator('.order-identity-title')).toHaveText(title)
    await filters.getByRole('button', { name: 'Todos', exact: true }).click()
    await expect(cards).toHaveCount(3)
  }
  expect(new Set(colors).size).toBe(3)
  await page.screenshot({ path: 'test-results/order-channels-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/order-channels-mobile.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await panel.locator('.pos-pickup-card[data-channel="dine_in"]').click()
  await expect(
    page
      .getByRole('region', { name: 'Detalle de pedido en terminal' })
      .locator('.order-identity-title'),
  ).toHaveText('Mesa 12')
  const detail = page.getByRole('region', { name: 'Detalle de pedido en terminal', exact: true })
  await detail.getByRole('button', { name: 'Ver otros pedidos', exact: true }).click()
  await panel.locator('.pos-pickup-card[data-channel="delivery"]').click()
  await detail.getByRole('button', { name: 'Editar cliente', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Editar cliente del pedido', exact: true })
  await expect(editor.getByLabel('Nombre de quien recibe', { exact: true })).toHaveValue(
    'Carlos Ríos',
  )
  await editor.getByLabel('Nombre de quien recibe', { exact: true }).fill('Lucía Ríos')
  await editor.getByLabel('Dirección de entrega', { exact: true }).fill('Carrera 20 número 30-40')
  await editor
    .getByLabel('Motivo del cambio', { exact: true })
    .fill('Recibe un familiar en otra dirección')
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: 'Editar cliente', exact: true }).click()
  await expect(editor.getByLabel('Nombre de quien recibe', { exact: true })).toHaveValue(
    'Lucía Ríos',
  )
  await expect(editor.getByLabel('Dirección de entrega', { exact: true })).toHaveValue(
    'Carrera 20 número 30-40',
  )
  await editor.getByRole('button', { name: 'Cerrar edición de cliente', exact: true }).click()
})
