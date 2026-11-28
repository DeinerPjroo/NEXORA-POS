import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Domicilios: disponibilidad declarada, reasignacion e incidencias sin alterar dinero', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await fixtureWorkspace(page, 'Reparto e incidencias')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const { data: product } = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Pizza incidencias',
    sku: 'INCIDENTE',
    category_id: category.id,
    sale_price: '18000',
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
      color: '#7255db',
      target_minutes: 12,
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
  const role = (await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')).roles.find(
    (r) => r.name === 'Repartidor',
  )!.id
  const couriers = []
  for (const name of ['Diego prueba', 'Sandra prueba']) {
    couriers.push(
      (
        await writeApi<{ data: { id: number } }>(page, 'POST', 'employees', {
          idempotency_key: crypto.randomUUID(),
          name,
          email: `courier-${crypto.randomUUID()}@example.test`,
          role_id: role,
          is_active: true,
          branch_ids: [branch],
          password: 'RepartidorSeguro123',
          password_confirmation: 'RepartidorSeguro123',
        })
      ).data,
    )
  }
  const { data: order } = await writeApi<{ data: { id: number; revision: number } }>(
    page,
    'POST',
    'orders',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'delivery',
      currency: 'COP',
      delivery: {
        recipient_name: 'Ana entrega',
        phone: '3001234567',
        address: 'Calle de prueba 123',
      },
      items: [
        { product_id: product.id, product_revision: 2, quantity: 1, expected_unit_price: '18000' },
      ],
    },
  )
  const { data: dispatch } = await writeApi<{
    data: { tickets: { id: number; revision: number }[] }
  }>(page, 'POST', `orders/${order.id}/kitchen-dispatch`, {
    idempotency_key: crypto.randomUUID(),
    order_revision: order.revision,
  })
  let ticket = dispatch.tickets[0]
  for (const status of ['preparing', 'ready'])
    ticket = (
      await writeApi<{ data: typeof ticket }>(page, 'POST', `kitchen-tickets/${ticket.id}/status`, {
        idempotency_key: crypto.randomUUID(),
        revision: ticket.revision,
        status,
      })
    ).data
  await page.goto('/terminal/domicilios')
  await page
    .getByRole('button', { name: `Ver domicilio de Ana entrega, pedido #${order.id}`, exact: true })
    .click()
  const paymentDetail = page.getByRole('complementary', {
    name: 'Detalle del domicilio',
    exact: true,
  })
  await paymentDetail.getByRole('button', { name: 'Método de pago previsto', exact: true }).click()
  const plan = page.getByRole('dialog', { name: 'Método de pago previsto', exact: true })
  const methods = await readApi<{ data: { id: number; kind: string; name: string }[] }>(
    page,
    'deliveries/payment-options',
  )
  const cashMethod = methods.data.find((method) => method.kind === 'cash')!
  await plan.getByLabel('Método previsto', { exact: true }).selectOption(String(cashMethod.id))
  await plan.getByLabel('Motivo del método previsto').fill('Cliente indica pago en efectivo')
  const plans: string[] = []
  await page.route('**/api/v1/deliveries/*/payment-plan', async (route) => {
    plans.push(route.request().postData()!)
    const response = await route.fetch()
    if (plans.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await plan.getByRole('button', { name: 'Guardar método previsto', exact: true }).click()
  await expect(
    plan.getByRole('button', { name: 'Reintentar misma instrucción', exact: true }),
  ).toBeVisible()
  await expect(plan.getByRole('button', { name: 'Volver', exact: true })).toBeDisabled()
  await plan.getByRole('button', { name: 'Reintentar misma instrucción', exact: true }).click()
  await expect(plan).toHaveCount(0)
  expect(plans).toHaveLength(2)
  expect(plans[0]).toBe(plans[1])
  await expect(paymentDetail).toContainText(`Pago previsto: ${cashMethod.name}`)
  await expect(paymentDetail).toContainText('Solo instrucción')
  await page.getByRole('button', { name: 'Repartidores', exact: true }).click()
  const availability = page.getByRole('dialog', {
    name: 'Disponibilidad de repartidores',
    exact: true,
  })
  await availability.getByRole('button', { name: /Diego prueba/ }).click()
  await availability.getByLabel('Disponibilidad declarada', { exact: true }).selectOption('no')
  await availability.getByLabel('Motivo de disponibilidad').fill('Fuera de turno')
  const payloads: string[] = []
  await page.route('**/api/v1/deliveries/couriers/*/availability', async (route) => {
    payloads.push(route.request().postData()!)
    const response = await route.fetch()
    if (payloads.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await availability.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click()
  await expect(availability.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled()
  await availability
    .getByRole('button', { name: 'Reintentar misma disponibilidad', exact: true })
    .click()
  await expect(
    availability.getByRole('button', { name: /Diego prueba · No disponible/ }),
  ).toBeVisible()
  expect(payloads).toHaveLength(2)
  expect(payloads[0]).toBe(payloads[1])
  await availability.getByRole('button', { name: /Diego prueba/ }).click()
  await availability.getByLabel('Disponibilidad declarada', { exact: true }).selectOption('yes')
  await availability.getByLabel('Motivo de disponibilidad').fill('Inicio de turno')
  await availability.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click()
  await expect(
    availability.getByRole('button', { name: /Diego prueba · Disponible/ }),
  ).toBeVisible()
  await availability.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page
    .getByRole('button', { name: `Ver domicilio de Ana entrega, pedido #${order.id}`, exact: true })
    .click()
  const detail = page.getByRole('complementary', { name: 'Detalle del domicilio', exact: true })
  await detail.getByRole('button', { name: 'Asignar repartidor', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Asignar repartidor', exact: true })
  await dialog.getByLabel('Repartidor autorizado').selectOption(String(couriers[0].id))
  await dialog.getByRole('button', { name: 'Confirmar estado de entrega', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await detail.getByRole('button', { name: 'Cambiar repartidor', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Asignar repartidor', exact: true })
  await dialog.getByLabel('Repartidor autorizado').selectOption(String(couriers[1].id))
  await expect(dialog.getByLabel('Observación de entrega')).toHaveAttribute('required', '')
  await dialog.getByLabel('Observación de entrega').fill('Cambio de turno autorizado')
  await dialog.getByRole('button', { name: 'Confirmar estado de entrega', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await detail.getByRole('button', { name: 'Sale a reparto', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const before = (
    await readApi<{
      data: { revision: number; subtotal: string; status: string; sale_id: number | null }
    }>(page, `orders/${order.id}`)
  ).data
  await detail.getByRole('button', { name: 'Registrar entrega fallida', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Observación de entrega').fill('Cliente no responde')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await detail.getByRole('button', { name: 'Devuelto al restaurante', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByLabel('Observación de entrega')
    .fill('Regreso recibido por supervisor')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar estado de entrega', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await detail.getByText(/Historial de entrega/).click()
  await expect(detail).toContainText('Cliente no responde')
  await expect(detail).toContainText('Regreso recibido por supervisor')
  await expect(detail).toContainText('Repartidor: Sandra prueba')
  const after = (await readApi<{ data: typeof before }>(page, `orders/${order.id}`)).data
  for (const key of ['revision', 'subtotal', 'status', 'sale_id'] as const)
    expect(after[key]).toEqual(before[key])
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toEqual([])
  expect(errors).toEqual([])
})
