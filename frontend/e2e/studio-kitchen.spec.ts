import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Order } from '../src/features/operations/types'

test('Studio Kitchen: preview real, publicación y diseño congelado durante un estado incierto', async ({
  page,
  context,
}) => {
  test.setTimeout(100_000)
  await fixtureWorkspace(page, 'Studio Kitchen')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza Studio Kitchen',
      sku: 'STUDIO-KDS',
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
      name: 'Pizzas Studio',
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
  const order = (
    await writeApi<{ data: Order }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'takeaway',
      customer_name: 'Cliente Studio',
      reference: 'Recogida Studio',
      currency: 'COP',
      items: [
        {
          product_id: product.id,
          product_revision: 2,
          quantity: 1,
          expected_unit_price: '18000',
          notes: 'Sin cebolla',
          preparation_destination: 'takeaway',
        },
      ],
    })
  ).data
  await writeApi(page, 'POST', `orders/${order.id}/kitchen-dispatch`, {
    idempotency_key: crypto.randomUUID(),
    order_revision: order.revision,
  })
  await page.goto('/terminal/cocina')
  const board = page.locator('.kitchen-board')
  await expect(board.locator('.kitchen-ticket')).toHaveCSS('padding', '14px')
  const editorPage = await context.newPage()
  await editorPage.goto('/admin/studio/cocina')
  await expect(
    editorPage.getByRole('heading', { name: 'Diseña Nexora Kitchen', exact: true }),
  ).toBeVisible()
  const editor = editorPage.getByRole('region', { name: 'Editor de Kitchen' })
  const preview = editorPage.frameLocator('iframe')
  await expect(preview.locator('.kitchen-ticket')).toContainText('Pizza Studio Kitchen')
  await expect(preview.locator('.kitchen-ticket')).toContainText('Sin cebolla')
  await expect(preview.locator('.kitchen-ticket .preparation-badge')).toContainText('Empacar')
  await expect(preview.locator('time')).toBeVisible()
  await expect(preview.locator('.kitchen-sync')).toContainText('sin actualización automática')
  await expect(preview.locator('.studio-pos-render')).toHaveAttribute('inert', '')
  await editor.getByRole('button', { name: 'Cocina Compacta', exact: true }).click()
  await expect(preview.locator('.kitchen-ticket')).toHaveCSS('padding', '8px')
  await expect(board.locator('.kitchen-ticket')).toHaveCSS('padding', '14px')
  const ticketsBefore = await readApi<{ data: { id: number; status: string }[] }>(
    editorPage,
    `kitchen-tickets?branch_id=${branch}`,
  )
  expect(ticketsBefore.data).toHaveLength(1)
  expect(ticketsBefore.data[0].status).toBe('new')
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 2')
  await page.reload()
  await expect(board.locator('.kitchen-ticket')).toHaveCSS('padding', '8px')
  const requests: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/status'))
      requests.push(request.postDataJSON())
  })
  await page.route('**/api/v1/kitchen-tickets/*/status', (route) => route.abort('failed'), {
    times: 1,
  })
  await board.getByRole('button', { name: 'RECIBIR', exact: true }).click()
  const uncertain = page.getByRole('region', { name: 'Actualizar comanda', exact: true })
  await expect(uncertain.getByRole('button', { name: 'Reintentar mismo cambio' })).toBeVisible()
  await editor.getByRole('button', { name: 'Original', exact: true }).click()
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 4')
  await page.setViewportSize({ width: 960, height: 800 })
  await expect(board.locator('.kitchen-ticket')).toHaveCSS('padding', '8px')
  await uncertain.getByRole('button', { name: 'Reintentar mismo cambio' }).click()
  await expect(uncertain).toHaveCount(0)
  await expect(board.locator('.kitchen-ticket')).toHaveCSS('padding', '14px')
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  const ticketsAfter = await readApi<{ data: { id: number; status: string }[] }>(
    page,
    `kitchen-tickets?branch_id=${branch}`,
  )
  expect(ticketsAfter.data).toHaveLength(1)
  expect(ticketsAfter.data[0].status).toBe('preparing')
  expect((await readApi<{ data: unknown }>(page, 'studio/pos')).data).toBeNull()
  expect((await readApi<{ data: unknown }>(page, 'studio/tables')).data).toBeNull()
})
