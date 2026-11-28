import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Central busca pedidos anteriores a la pagina y conserva filtros de cocina al paginar', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await fixtureWorkspace(page, 'Central de domicilios')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza central',
    sku: 'CENTRAL',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  let first = 0
  for (let i = 0; i < 22; i++) {
    const { data: order } = await writeApi<{ data: { id: number } }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'delivery',
      currency: 'COP',
      delivery: {
        recipient_name: i === 0 ? 'Ana anterior' : `Cliente central ${i}`,
        phone: '3001234567',
        address: 'Calle de prueba 123',
      },
      items: [
        { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '18000' },
      ],
    })
    if (i === 0) first = order.id
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/terminal/domicilios')
  const summary = page.getByLabel('Resumen de domicilios filtrados')
  await expect(summary).toContainText('22')
  await expect(
    page.getByRole('button', {
      name: `Ver domicilio de Ana anterior, pedido #${first}`,
      exact: true,
    }),
  ).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Buscar domicilios', exact: true }).fill('Ana anterior')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(
    page.getByRole('button', {
      name: `Ver domicilio de Ana anterior, pedido #${first}`,
      exact: true,
    }),
  ).toBeVisible()
  await expect(summary).toContainText('1 Coincidencias')
  await expect(page.getByText('0 min desde registro', { exact: false })).toBeVisible()
  await page.getByLabel('Filtrar por cocina').selectOption('ready')
  await expect(
    page.getByRole('heading', { name: 'Sin coincidencias con estos filtros' }),
  ).toBeVisible()
  await page.getByLabel('Filtrar por cocina').selectOption('open')
  await page
    .getByRole('button', { name: 'Ver domicilio de Ana anterior, pedido #' + first, exact: true })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'Detalle del domicilio', exact: true }),
  ).toContainText('Ana anterior')
  const bounds = await summary.boundingBox()
  expect(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 800).toBeTruthy()
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  ).toBeTruthy()
  expect(errors).toEqual([])
})
