import { test, expect, type Locator } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Order } from '../src/features/operations/types'

async function publish(editor: Locator) {
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
}

test('Studio canales: recogidas y toma de domicilios independientes, sin pedidos desde preview', async ({
  page,
  context,
}) => {
  test.setTimeout(110_000)
  await fixtureWorkspace(page, 'Studio canales')
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  await writeApi(page, 'POST', `cash/registers/${register.id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '0',
    currency: 'COP',
  })
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza Studio Canales',
    sku: 'STUDIO-CHANNEL',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/admin/studio/recogidas')
  await expect(page.getByRole('heading', { name: 'Diseña Para llevar', exact: true })).toBeVisible()
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS' })
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('.pos-terminal')).toContainText('Para llevar · Mostrador')
  await expect(preview.locator('.order-product')).toContainText('Pizza Studio Canales')
  await editor.getByRole('button', { name: /^Compacta/ }).click()
  await publish(editor)
  await expect(editor).toContainText('Publicado 2')
  const runtime = await context.newPage()
  await runtime.goto('/terminal/recogidas')
  const terminal = runtime.locator('.pos-terminal')
  await expect(terminal).toHaveAttribute('data-studio-revision', '2')
  expect(
    await terminal.evaluate((node) => node.style.getPropertyValue('--studio-tracks')),
  ).toContain('400px')
  const add = terminal.getByRole('button', { name: 'Agregar Pizza Studio Canales', exact: true })
  await expect(add).toBeEnabled()
  await add.click()
  await editor.getByRole('button', { name: /^Original/ }).click()
  await publish(editor)
  await expect(editor).toContainText('Publicado 4')
  await runtime.setViewportSize({ width: 960, height: 800 })
  await expect(terminal).toHaveAttribute('data-studio-revision', '2')
  expect(
    await terminal.evaluate((node) => node.style.getPropertyValue('--studio-tracks')),
  ).toContain('400px')
  await runtime.close()
  await page.goto('/admin/studio/domicilios/pedido')
  await expect(
    page.getByRole('heading', { name: 'Diseña pedidos de domicilio', exact: true }),
  ).toBeVisible()
  await expect(preview.locator('.pos-terminal')).toContainText('Domicilios · entrega')
  await editor.getByRole('button', { name: /^Táctil/ }).click()
  await publish(editor)
  await expect(editor).toContainText('Publicado 2')
  await page.goto('/terminal/domicilios/nuevo')
  await expect(page.locator('.pos-terminal')).toHaveAttribute('data-studio-revision', '2')
  await expect(page.locator('.pos-terminal')).toHaveCSS('--studio-font', '16px')
  expect((await readApi<{ data: unknown }>(page, 'studio/pos')).data).toBeNull()
  expect((await readApi<{ meta: { total: number } }>(page, 'orders')).meta.total).toBe(0)
})

test('Studio Domicilios: lista y detalle reales, publicación y congelado durante edición de cliente', async ({
  page,
  context,
}) => {
  test.setTimeout(110_000)
  await fixtureWorkspace(page, 'Studio reparto')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza reparto Studio',
      sku: 'STUDIO-DELIVERY',
      category_id: category.id,
      sale_price: '18000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const order = (
    await writeApi<{ data: Order }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'delivery',
      currency: 'COP',
      customer_name: 'Ana Studio',
      delivery: { recipient_name: 'Ana Studio', phone: '3001234567', address: 'Calle Studio 20' },
      items: [
        { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '18000' },
      ],
    })
  ).data
  await page.goto('/admin/studio/domicilios')
  const editor = page.getByRole('region', { name: 'Editor de Domicilios' })
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('.delivery-tile-name')).toHaveText('Ana Studio')
  await page.getByLabel('Panel de vista previa', { exact: true }).selectOption('detail')
  await expect(preview.getByRole('complementary', { name: 'Detalle del domicilio' })).toContainText(
    'Pizza reparto Studio',
  )
  await expect(preview.locator('.delivery-board-footer')).toContainText('sin consulta automática')
  await editor.getByRole('button', { name: 'Domicilios Compactos', exact: true }).click()
  await expect(preview.locator('.delivery-tile')).toHaveCSS('width', '205px')
  await publish(editor)
  await expect(editor).toContainText('Publicado 2')
  const runtime = await context.newPage()
  await runtime.goto('/terminal/domicilios')
  await expect(runtime.locator('.delivery-tile')).toHaveCSS('width', '205px')
  await runtime
    .getByRole('button', { name: `Ver domicilio de Ana Studio, pedido #${order.id}`, exact: true })
    .click()
  await runtime.getByRole('button', { name: 'Editar cliente', exact: true }).click()
  const modal = runtime.getByRole('dialog', { name: 'Cliente del domicilio', exact: true })
  await expect(modal).toBeVisible()
  await editor.getByRole('button', { name: 'Original', exact: true }).click()
  await publish(editor)
  await expect(editor).toContainText('Publicado 4')
  await runtime.setViewportSize({ width: 960, height: 800 })
  await expect(runtime.locator('.delivery-terminal')).toHaveCSS(
    '--studio-delivery-card-width',
    '205px',
  )
  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(runtime.locator('.delivery-terminal')).toHaveCSS(
    '--studio-delivery-card-width',
    '230px',
  )
  const after = (await readApi<{ data: Order }>(runtime, `orders/${order.id}`)).data
  expect(after.revision).toBe(order.revision)
  expect(after.subtotal).toBe(order.subtotal)
  expect(after.sale_id).toBeNull()
  expect((await readApi<{ data: unknown }>(page, 'studio/pickup')).data).toBeNull()
  expect((await readApi<{ data: unknown }>(page, 'studio/delivery_pos')).data).toBeNull()
})
