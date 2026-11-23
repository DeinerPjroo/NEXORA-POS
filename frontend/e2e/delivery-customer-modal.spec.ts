import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Detalle amplio y modal de cliente muestra varios campos, guarda una vez y desplaza internamente en móvil', async ({
  page,
}) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(20_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Editor amplio domicilio')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza cliente',
      sku: 'CUSTOMER-MODAL',
      category_id: category.id,
      sale_price: '18000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const order = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'delivery',
      currency: 'COP',
      customer_name: 'Cliente inicial',
      delivery: {
        recipient_name: 'Cliente inicial',
        phone: '3001234567',
        address: 'Calle inicial número 20',
      },
      items: [
        { product_id: product.id, product_revision: 1, quantity: 2, expected_unit_price: '18000' },
      ],
    })
  ).data
  await page.goto('/terminal/domicilios')
  await page
    .getByRole('button', {
      name: `Ver domicilio de Cliente inicial, pedido #${order.id}`,
      exact: true,
    })
    .click()
  const detail = page.getByRole('complementary', { name: 'Detalle del domicilio' })
  await expect(detail.getByRole('button', { name: 'Editar cliente', exact: true })).toBeVisible()
  expect((await detail.boundingBox())!.width).toBeGreaterThan(580)
  await detail.getByRole('button', { name: 'Editar cliente', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Cliente del domicilio', exact: true })
  await expect(modal.getByLabel('Nombre de quien recibe', { exact: true })).toHaveValue(
    'Cliente inicial',
  )
  expect((await modal.boundingBox())!.width).toBeGreaterThanOrEqual(900)
  const fields = modal.locator('input, textarea')
  const visible = await fields.evaluateAll((controls) =>
    controls.every((control) => {
      const r = control.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return (
        r.height > 0 &&
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        !!hit &&
        (hit === control || control.contains(hit))
      )
    }),
  )
  expect(visible).toBe(true)
  let updates = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith(`/orders/${order.id}/customer`))
      updates++
  })
  await modal.getByLabel('Nombre del cliente', { exact: true }).fill('Cliente corregido')
  await modal.getByLabel('Referencia del pedido', { exact: true }).fill('Portería principal')
  await modal.getByLabel('Nombre de quien recibe', { exact: true }).fill('Receptor corregido')
  await modal.getByLabel('Teléfono del domicilio', { exact: true }).fill('3007654321')
  await modal
    .getByLabel('Dirección de entrega', { exact: true })
    .fill('Carrera corregida número 30')
  await modal.getByLabel('Barrio o zona', { exact: true }).fill('Centro')
  await modal.getByLabel('Indicaciones de entrega', { exact: true }).fill('Llamar al llegar')
  await modal.getByLabel('Referencias de ubicación', { exact: true }).fill('Edificio azul')
  await modal.getByLabel('Motivo del cambio', { exact: true }).fill('Corregir datos de entrega')
  expect(updates).toBe(0)
  await page.screenshot({ path: 'test-results/delivery-customer-modal-desktop.png' })
  await modal.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(
    detail.getByRole('heading', { name: 'Receptor corregido', exact: true }),
  ).toBeVisible()
  expect(updates).toBe(1)
  const customer = await readApi<{
    data: { customer_name: string; reference: string; delivery: { address: string; phone: string } }
  }>(page, `orders/${order.id}/customer`)
  expect(customer.data).toMatchObject({
    customer_name: 'Cliente corregido',
    reference: 'Portería principal',
    delivery: { address: 'Carrera corregida número 30', phone: '3007654321' },
  })
  const persisted = (
    await readApi<{ data: { subtotal: string; items: { quantity: number }[] } }>(
      page,
      `orders/${order.id}`,
    )
  ).data
  expect(persisted.subtotal).toBe('36000.0000')
  expect(persisted.items).toHaveLength(1)
  expect(persisted.items[0].quantity).toBe(2)
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await detail.getByRole('button', { name: 'Editar cliente', exact: true }).click()
  await expect(modal.getByLabel('Nombre del cliente', { exact: true })).toHaveValue(
    'Cliente corregido',
  )
  await modal.getByLabel('Referencias de ubicación', { exact: true }).scrollIntoViewIfNeeded()
  await expect(modal.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeInViewport({
    ratio: 1,
  })
  const scroll = await modal
    .locator('.pos-client-fields')
    .evaluate((node) => ({
      top: node.scrollTop,
      height: node.clientHeight,
      content: node.scrollHeight,
    }))
  expect(scroll.top).toBeGreaterThan(0)
  expect(scroll.content).toBeGreaterThan(scroll.height)
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true)
  await page.screenshot({ path: 'test-results/delivery-customer-modal-mobile.png' })
  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
  expect(updates).toBe(1)
})
