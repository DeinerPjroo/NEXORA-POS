import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Domicilio guarda cliente y varias direcciones, conserva snapshot y se recupera sin caja abierta', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await fixtureWorkspace(page, 'Domicilios con libreta')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const branch = branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta domicilios',
    color: '#d58a16',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza a domicilio',
    sku: 'BOOK-DELIVERY',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/terminal/domicilios/nuevo')
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  const details = page.getByRole('group', { name: 'Datos del cliente y pedido', exact: true })
  await details.getByLabel('Nombre del cliente', { exact: true }).fill('Laura Gómez')
  await details.getByLabel('Nombre de quien recibe', { exact: true }).fill('Laura Gómez')
  await details.getByLabel('Teléfono del domicilio', { exact: true }).fill('3001234567')
  await details.getByLabel('Dirección de entrega', { exact: true }).fill('Calle 10 número 20')
  await details.getByLabel('Barrio o zona', { exact: true }).fill('Centro')
  await details.getByLabel('Referencias de ubicación', { exact: true }).fill('Portería azul')
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación operativa' })
      .getByRole('link', { name: 'Pedidos', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true')
  await details.getByRole('button', { name: 'Guardar cliente y dirección', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Guardar cliente y dirección', exact: true })
  await create.getByLabel('Nombre de esta dirección', { exact: true }).fill('Casa')
  await create.getByRole('button', { name: 'Confirmar registro', exact: true }).click()
  await expect(create).toHaveCount(0)
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(0)
  await details.getByRole('button', { name: 'Dirección nueva', exact: true }).click()
  await details.getByLabel('Dirección de entrega', { exact: true }).fill('Carrera 30 número 40')
  await details.getByLabel('Barrio o zona', { exact: true }).fill('Norte')
  await details.getByRole('button', { name: 'Guardar esta dirección', exact: true }).click()
  const address = page.getByRole('dialog', { name: 'Guardar dirección del cliente', exact: true })
  await address.getByLabel('Nombre de esta dirección', { exact: true }).fill('Trabajo')
  const addressPath = '**/api/v1/customers/*/addresses'
  let savedBody: unknown
  await page.route(addressPath, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    savedBody = route.request().postDataJSON()
    const response = await route.fetch()
    const { data } = await response.json()
    await writeApi(page, 'POST', `customers/${data.id}/addresses`, {
      idempotency_key: crypto.randomUUID(),
      revision: data.revision,
      label: 'Sede adicional',
      recipient_name: 'Otra persona',
      phone: '3001111111',
      address: 'Otra calle número 60',
    })
    await route.abort('failed')
  })
  await address.getByRole('button', { name: 'Confirmar registro', exact: true }).click()
  await expect(
    address.getByRole('button', { name: 'Reintentar mismo registro', exact: true }),
  ).toBeVisible()
  await expect(address.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled()
  await page.unroute(addressPath)
  const retried = page.waitForRequest(
    (request) => request.method() === 'POST' && /\/customers\/\d+\/addresses$/.test(request.url()),
  )
  await address.getByRole('button', { name: 'Reintentar mismo registro', exact: true }).click()
  expect((await retried).postDataJSON()).toEqual(savedBody)
  await expect(address).toHaveCount(0)
  await expect(details.getByLabel('Dirección de entrega', { exact: true })).toHaveValue(
    'Carrera 30 número 40',
  )
  await details.getByRole('button', { name: /^Casa ·/ }).click()
  await expect(details.getByLabel('Dirección de entrega', { exact: true })).toHaveValue(
    'Calle 10 número 20',
  )
  await expect(details.getByLabel('Dirección de entrega', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  )
  await page.screenshot({ path: 'test-results/delivery-customer-book.png' })
  await details.getByRole('button', { name: 'Listo · volver al pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza a domicilio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar al cobro', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'GUARDAR DOMICILIO', exact: true }).click()
  await expect(page.locator('.pos-order-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.pos-dining-selection strong')).toHaveText('Laura Gómez')
  type Customer = {
    id: number
    revision: number
    addresses: {
      id: number
      label: string
      revision: number
      recipient_name: string
      phone: string
      address: string
    }[]
  }
  const { data: customers } = await readApi<{ data: Customer[] }>(
    page,
    `customers?branch_id=${branch}&search=300123`,
  )
  expect(customers).toHaveLength(1)
  expect(customers[0].addresses).toHaveLength(3)
  const casa = customers[0].addresses.find((a) => a.label === 'Casa')!
  await writeApi(page, 'PUT', `customers/${customers[0].id}/addresses/${casa.id}`, {
    idempotency_key: crypto.randomUUID(),
    revision: customers[0].revision,
    address_revision: casa.revision,
    label: 'Casa',
    recipient_name: casa.recipient_name,
    phone: casa.phone,
    address: 'Nueva calle número 50',
    neighborhood: 'Nueva zona',
  })
  const { data: deliveries } = await readApi<{
    data: { address: string; neighborhood: string; customer_id: number }[]
  }>(page, `deliveries?branch_id=${branch}`)
  expect(deliveries).toHaveLength(1)
  expect(deliveries[0]).toMatchObject({
    address: 'Calle 10 número 20',
    neighborhood: 'Centro',
    customer_id: customers[0].id,
  })
  await page.goto('/terminal/domicilios')
  await expect(page.locator('.delivery-tile')).toContainText('Calle 10 número 20')
  await page.reload()
  await expect(page.locator('.delivery-tile')).toHaveCount(1)
  await page.goto('/terminal/domicilios/nuevo')
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await details.getByLabel('Buscar cliente guardado', { exact: true }).fill('300123')
  await details.getByRole('button', { name: 'Laura Gómez · 3001234567', exact: true }).click()
  await details.getByRole('button', { name: /^Casa ·/ }).click()
  await expect(details.getByLabel('Dirección de entrega', { exact: true })).toHaveValue(
    'Nueva calle número 50',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/delivery-customer-book-mobile.png' })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(details.getByLabel('Dirección de entrega', { exact: true })).toHaveValue('')
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(1)
})
