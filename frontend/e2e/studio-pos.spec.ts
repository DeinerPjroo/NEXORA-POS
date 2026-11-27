import { test, expect, type Locator } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { SavedPosLayout } from '../src/features/studio/PosStudioPage'
import type { PosLayout } from '../src/features/studio/pos-layout'

async function range(control: Locator, value: number) {
  await control.evaluate((node, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      node,
      String(next),
    )
    node.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test('Studio A/B: edición visual real, borrador aislado, reintento exacto, publicación y cobro intacto', async ({
  page,
}) => {
  test.setTimeout(210_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await fixtureWorkspace(page, 'Studio real')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Pizzas',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza Studio',
    sku: 'STUDIO',
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
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', `cash/registers/${register.id}/open`, {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '0',
      currency: 'COP',
    })
  ).data
  const room = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Salón Studio',
      color: '#7255db',
      is_active: true,
    })
  ).data
  const table = (
    await writeApi<{ data: { id: number; revision: number } }>(
      page,
      'POST',
      `dining-rooms/${room.id}/tables`,
      {
        idempotency_key: crypto.randomUUID(),
        room_revision: 1,
        name: 'Mesa Studio',
        shape: 'square',
        capacity: 4,
        color: '#7255db',
        is_active: true,
      },
    )
  ).data
  await writeApi(page, 'POST', 'dining-sessions', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    guest_count: 2,
    tables: [{ id: table.id, revision: table.revision }],
    notes: '',
    waiter_id: null,
  })
  await page.goto('/admin/studio/pos')
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS' })
  const canvas = page.getByRole('region', { name: 'Vista previa real de Terminal' })
  await expect(canvas.frameLocator('iframe').locator('.order-product')).toContainText(
    'Pizza Studio',
  )
  await expect(canvas.frameLocator('iframe').locator('.studio-pos-render')).toHaveAttribute(
    'inert',
    '',
  )
  await range(editor.getByLabel('Ancho del pedido', { exact: true }), 420)
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toHaveValue('420')
  await canvas
    .getByRole('button', { name: 'Seleccionar Productos y teclado', exact: true })
    .dragTo(canvas.getByRole('button', { name: 'Seleccionar Pedido y resumen', exact: true }))
  await canvas.getByRole('button', { name: 'Seleccionar Pedido y resumen', exact: true }).click()
  const grip = canvas.getByRole('button', { name: 'Redimensionar panel del pedido', exact: true })
  const box = (await grip.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  expect(
    Number(await editor.getByLabel('Ancho del pedido', { exact: true }).inputValue()),
  ).toBeGreaterThan(420)
  await editor.getByLabel('Color de acento', { exact: true }).fill('#185b8f')
  expect((await readApi<{ meta: { total: number } }>(page, 'orders')).meta.total).toBe(0)
  await page.screenshot({ path: 'test-results/studio-pos-editor.png' })
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/studio/pos/draft'))
      bodies.push(request.postDataJSON())
  })
  await page.route(
    '**/api/v1/studio/pos/draft',
    async (route) => {
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(
    editor.getByRole('button', { name: 'Reintentar guardado', exact: true }),
  ).toBeVisible()
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Reintentar guardado', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  expect(
    (await readApi<{ data: { revision: number } }>(page, 'studio/pos/active')).data.revision,
  ).toBe(0)
  const saved = (await readApi<{ data: SavedPosLayout }>(page, 'studio/pos')).data
  expect((saved.draft as PosLayout).panels).toEqual(['actions', 'products', 'order', 'categories'])
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor.getByText(/Publicado 2/)).toBeVisible()
  await page.reload()
  await expect(editor.getByLabel('Color de acento', { exact: true })).toHaveValue('#185b8f')
  await page.goto('/pos')
  const terminal = page.locator('.pos-terminal')
  await expect(terminal).toHaveAttribute('data-studio-revision', '2')
  expect(
    await terminal.evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--pos-primary').trim(),
    ),
  ).toBe('#185b8f')
  const products = (await terminal.locator('.order-menu').boundingBox())!
  const orderPanel = (await terminal.locator('.pos-order-workspace').boundingBox())!
  expect(products.x).toBeLessThan(orderPanel.x)
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await page.getByRole('button', { name: 'Seleccionar Mesa Studio', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza Studio', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 600 })
  await expect(terminal).toHaveAttribute('data-studio-revision', '2')
  for (const key of await page.locator('.pos-keypad-keys button').all()) {
    expect(
      await key.evaluate((node) => {
        const r = node.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return (
          r.top >= 0 && r.bottom <= innerHeight && !!hit && (hit === node || node.contains(hit))
        )
      }),
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20000')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`))
          .data.expected_amount,
    )
    .toBe('18000.0000')
  const orders = (await readApi<{ data: { subtotal: string; sale_id: number }[] }>(page, 'orders'))
    .data
  expect(orders).toHaveLength(1)
  expect(orders[0].subtotal).toBe('18000.0000')
  expect(orders[0].sale_id).toBeTruthy()
})
