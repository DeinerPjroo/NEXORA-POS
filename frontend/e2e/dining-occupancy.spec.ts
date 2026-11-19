import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { DiningRoom, DiningTable } from '../src/features/dining/types'
import type { DiningSession } from '../src/features/dining/session-types'

async function setup(page: import('@playwright/test').Page) {
  await fixtureWorkspace(page, 'Servicio Nexora')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const room = (
    await writeApi<{ data: DiningRoom }>(page, 'POST', 'dining-rooms', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Servicio',
      color: '#F5F7FB',
      is_active: true,
    })
  ).data
  const tables: DiningTable[] = []
  for (let n = 1; n <= 3; n++)
    tables.push(
      (
        await writeApi<{ data: DiningTable }>(page, 'POST', 'dining-rooms/' + room.id + '/tables', {
          idempotency_key: crypto.randomUUID(),
          room_revision: n,
          name: 'Mesa ' + n,
          shape: 'circle',
          color: '#DCD6FF',
          capacity: 4,
          is_active: true,
        })
      ).data,
    )
  return { branch, room, tables }
}

test('Mesas: ocupar, unir, separar, asignar mesero, POS, traslado, cobro y liberación reales', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const { branch, room, tables } = await setup(page)
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Servicio',
    color: '#8271FF',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Café del salón',
    sku: 'CAFE',
    category_id: category.id,
    sale_price: '10.1250',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0].id
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'cash/registers/' + register + '/open', {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '100',
      currency: 'COP',
    })
  ).data
  await page.goto('/salones/' + room.id)
  await page.getByRole('button', { name: 'Ocupar Mesa 1', exact: true }).click()
  await page.getByRole('checkbox', { name: /Mesa 2/ }).check()
  await page.getByLabel('Personas en la atención', { exact: true }).fill('6')
  await page.getByLabel('Mesero asignado', { exact: true }).selectOption({ label: 'Ana Pérez' })
  await page.getByRole('button', { name: 'Guardar atención', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ocupar mesas', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Ver atención #/ })).toHaveCount(2)
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.locator('.dining-occupancy-grid').screenshot({
    path: '../docs/screenshots/dining-occupancy-desktop.png',
    animations: 'disabled',
  })
  const a = (await readApi<{ data: DiningSession[] }>(page, 'dining-sessions?status=open')).data[0]
  await page
    .getByRole('link', { name: 'Ver atención #' + a.id, exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'Unir, separar o asignar mesero', exact: true }).click()
  await page.getByLabel('Personas en la atención', { exact: true }).fill('3')
  await page.getByRole('checkbox', { name: /Mesa 1/ }).uncheck()
  await page.getByRole('button', { name: 'Guardar atención', exact: true }).click()
  await page.getByRole('link', { name: 'Tomar pedido en POS', exact: true }).click()
  await expect(page.getByLabel('Tipo de pedido', { exact: true })).toHaveValue('dine_in')
  await expect(page.getByLabel('Atención de mesas', { exact: true })).toHaveValue(String(a.id))
  await page.getByRole('button', { name: 'Agregar Café del salón', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page).toHaveURL(/\/pos\/pedidos\/\d+\/cobrar$/)
  const orderId = Number(page.url().split('/').at(-2))
  const order = (
    await readApi<{
      data: {
        dining_session_id: number
        dining_snapshot: { tables: { name: string }[] }
        subtotal: string
      }
    }>(page, 'orders/' + orderId)
  ).data
  expect(order.dining_session_id).toBe(a.id)
  expect(order.dining_snapshot.tables.map((t) => t.name)).toEqual(['Mesa 2'])
  expect(order.subtotal).toBe('10.1250')
  const b = (
    await writeApi<{ data: DiningSession }>(page, 'POST', 'dining-sessions', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      guest_count: 2,
      waiter_id: null,
      tables: [{ id: tables[2].id, revision: tables[2].revision }],
    })
  ).data
  await page.goto('/salones/atenciones/' + a.id)
  await page.getByRole('button', { name: 'Cerrar atención', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Quedan pedidos sin cobrar')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Trasladar pedido #' + orderId, exact: true }).click()
  await page.getByLabel('Atención de destino', { exact: true }).selectOption(String(b.id))
  const transferBodies: string[] = []
  await page.route('**/api/v1/orders/' + orderId + '/dining-transfer', async (route) => {
    transferBodies.push(route.request().postData()!)
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    if (transferBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Confirmar traslado', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar mismo traslado', exact: true }),
  ).toBeVisible()
  await page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/dining-sessions/' + a.id) &&
      response.request().method() === 'GET',
    { timeout: 20000 },
  )
  await expect(
    page.getByRole('button', { name: 'Reintentar mismo traslado', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar mismo traslado', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Trasladar pedido #' + orderId, exact: true }),
  ).toHaveCount(0)
  expect(transferBodies).toHaveLength(2)
  expect(transferBodies[1]).toBe(transferBodies[0])
  await expect(page.getByText('Esta atención aún no tiene pedidos.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar atención', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(page.getByText('Todas las mesas liberadas', { exact: true })).toBeVisible()
  await page.goto('/pos/pedidos/' + orderId + '/cobrar')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, 'cash/sessions/' + cash.id)).data
      .expected_amount,
  ).toBe('110.1300')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/salones/atenciones/' + b.id)
  await expect(page.getByRole('heading', { name: 'Atención #' + b.id, exact: true })).toBeVisible()
  await page
    .locator('#contenido')
    .screenshot({ path: '../docs/screenshots/dining-session-mobile.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Cerrar atención', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(page.getByText('Todas las mesas liberadas', { exact: true })).toBeVisible()
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toHaveLength(1)
  const occupancy = await readApi<{ data: { session: unknown }[] }>(
    page,
    'dining-rooms/' + room.id + '/occupancy',
  )
  expect(occupancy.data.every((t) => t.session === null)).toBe(true)
})

test('Mesas: apertura con respuesta perdida conserva UUID y no duplica ocupación', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { room } = await setup(page)
  await page.goto('/salones/' + room.id)
  await page.getByRole('button', { name: 'Ocupar Mesa 1', exact: true }).click()
  const bodies: string[] = []
  await page.route('**/api/v1/dining-sessions', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar atención', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar misma atención', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Personas en la atención', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar misma atención', exact: true }).click()
  await expect(page.getByRole('link', { name: /Ver atención #/ })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  expect(
    (await readApi<{ data: DiningSession[] }>(page, 'dining-sessions?status=open')).data,
  ).toHaveLength(1)
})

test('Mesas: POS conserva envío incierto tras cancelar pedido, cerrar atención y refrescar contexto', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const { branch, tables } = await setup(page)
  const s = (
    await writeApi<{ data: DiningSession }>(page, 'POST', 'dining-sessions', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      guest_count: 2,
      waiter_id: null,
      tables: [{ id: tables[0].id, revision: tables[0].revision }],
    })
  ).data
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Prueba',
    color: '#8271FF',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pedido incierto',
    sku: 'INCIERTO',
    category_id: category.id,
    sale_price: '10',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0].id
  await writeApi(page, 'POST', 'cash/registers/' + register + '/open', {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '0',
    currency: 'COP',
  })
  await page.goto('/pos/atenciones/' + s.id)
  await page.getByRole('button', { name: 'Agregar Pedido incierto', exact: true }).click()
  const bodies: string[] = []
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
  const o = (await readApi<{ data: { id: number; revision: number }[] }>(page, 'orders')).data[0]
  await writeApi(page, 'POST', 'orders/' + o.id + '/status', {
    idempotency_key: crypto.randomUUID(),
    revision: o.revision,
    status: 'cancelled',
    reason: 'Cliente se retiró',
  })
  const current = (await readApi<{ data: DiningSession }>(page, 'dining-sessions/' + s.id)).data
  await writeApi(page, 'POST', 'dining-sessions/' + s.id + '/close', {
    idempotency_key: crypto.randomUUID(),
    revision: current.revision,
  })
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/dining-sessions/' + s.id) &&
      response.request().method() === 'GET',
  )
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await refreshed
  await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('/pos/pedidos/' + o.id + '/cobrar$'))
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toBe(bodies[0])
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(1)
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toHaveLength(0)
})

test('Mesas: vistas de ocupación y atención cargadas en escritorio y móvil', async ({ page }) => {
  test.setTimeout(90_000)
  const { branch, room, tables } = await setup(page)
  const s = (
    await writeApi<{ data: DiningSession }>(page, 'POST', 'dining-sessions', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      guest_count: 6,
      waiter_id: null,
      notes: 'Servicio en mesa',
      tables: tables.slice(0, 2).map((t) => ({ id: t.id, revision: t.revision })),
    })
  ).data
  await page.goto('/salones/' + room.id)
  await expect(page.getByRole('link', { name: 'Ver atención #' + s.id, exact: true })).toHaveCount(
    2,
  )
  await expect(page.getByRole('button', { name: 'Ocupar Mesa 3', exact: true })).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.locator('.dining-occupancy-grid').screenshot({
    path: '../docs/screenshots/dining-occupancy-desktop.png',
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/salones/atenciones/' + s.id)
  await expect(page.getByRole('heading', { name: 'Atención #' + s.id, exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Unir, separar o asignar mesero', exact: true }),
  ).toBeVisible()
  await page
    .locator('#contenido')
    .screenshot({ path: '../docs/screenshots/dining-session-mobile.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
