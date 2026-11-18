import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product } from '../src/features/catalog/types'
import type { AvailabilityWindow } from '../src/features/catalog/availability-types'
import type { Order } from '../src/features/operations/types'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('horarios: configurar, cerrar antes de registrar y conservar snapshot al reintentar y cobrar', async ({
  page,
}) => {
  test.setTimeout(300_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Horarios')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: Product }>(page, 'POST', 'products', {
      name: 'Pizza horario',
      sku: 'PIZZA-H',
      category_id: category.id,
      sale_price: '100.0050',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const path = `products/${product.id}`
  const current = async () => (await readApi<{ data: Product }>(page, path)).data
  await writeApi(page, 'POST', `${path}/variants`, {
    product_revision: 1,
    currency: 'COP',
    name: 'Grande',
    sku: 'PIZZA-H-G',
    sale_price: '120.0050',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'POST', `${path}/modifier-groups`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 2,
    currency: 'COP',
    name: 'Extras',
    kind: 'addon',
    min_select: 1,
    max_select: 1,
    is_active: true,
    options: [{ name: 'Queso', extra_price: '2.5050', is_active: true }],
  })
  await page.goto(`/productos/${product.id}`)
  await page.getByRole('button', { name: 'Nueva ventana', exact: true }).click()
  await page.getByLabel('Nombre de la ventana', { exact: true }).fill('Servicio noche')
  await page.getByLabel('Día de inicio', { exact: true }).selectOption('5')
  await page.getByLabel('Hora inicial', { exact: true }).fill('22:00')
  await page.getByLabel('Hora final', { exact: true }).fill('02:00')
  await page.getByLabel('Termina al día siguiente', { exact: true }).check()
  await page.getByLabel('Vigente desde', { exact: true }).fill('2099-01-01')
  await page.getByLabel('Vigente hasta', { exact: true }).fill('2099-12-31')
  await page.getByLabel('Ventana activa', { exact: true }).uncheck()
  const windowBodies: string[] = []
  await page.route(`**/api/v1/${path}/availability-windows`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    windowBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (windowBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar ventana', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar ventana', exact: true })).toBeVisible()
  await expect(page.getByLabel('Hora inicial', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar ventana', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(windowBodies).toHaveLength(2)
  expect(windowBodies[0]).toBe(windowBodies[1])
  expect(JSON.parse(windowBodies[0]).expected_timezone).toBe('America/Bogota')
  await page.unroute(`**/api/v1/${path}/availability-windows`)
  await page.getByRole('button', { name: 'Editar ventana Servicio noche', exact: true }).click()
  await expect(page.getByLabel('Vigente hasta', { exact: true })).toHaveValue('2099-12-31')
  await page.getByLabel('Nombre de la ventana', { exact: true }).fill('Noche archivada')
  await page.getByRole('button', { name: 'Guardar ventana', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Configurar horario', exact: true }).click()
  await page.getByLabel('Aplicar ventanas de disponibilidad', { exact: true }).check()
  const policyBodies: string[] = []
  await page.route(`**/api/v1/${path}/availability-policy`, async (route) => {
    policyBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (policyBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar horario', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar horario', exact: true })).toBeVisible()
  await expect(
    page.getByLabel('Aplicar ventanas de disponibilidad', { exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar horario', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(policyBodies).toHaveLength(2)
  expect(policyBodies[0]).toBe(policyBodies[1])
  expect(JSON.parse(policyBodies[0]).expected_timezone).toBe('America/Bogota')
  await page.unroute(`**/api/v1/${path}/availability-policy`)
  await page.goto('/pedidos/nuevo')
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza horario', exact: true }),
  ).toBeDisabled()
  await expect(page.locator('.order-product')).toContainText('Fuera del horario de disponibilidad')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/availability-menu-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  // Siete ventanas de24h evitan depender del día/hora del equipo de pruebas.
  const windows: AvailabilityWindow[] = []
  let revision = (await current()).revision
  for (let weekday = 1; weekday <= 7; weekday++) {
    windows.push(
      (
        await writeApi<{ data: AvailabilityWindow }>(page, 'POST', `${path}/availability-windows`, {
          idempotency_key: crypto.randomUUID(),
          product_revision: revision++,
          currency: 'COP',
          expected_timezone: 'America/Bogota',
          name: `Servicio ${weekday}`,
          weekday,
          start_time: '00:00',
          end_time: '00:00',
          ends_next_day: true,
          is_active: true,
        })
      ).data,
    )
  }
  async function activeWindows(active: boolean) {
    let revision = (await current()).revision
    for (let index = 0; index < windows.length; index++) {
      const window = windows[index]
      windows[index] = (
        await writeApi<{ data: AvailabilityWindow }>(
          page,
          'PUT',
          `${path}/availability-windows/${window.id}`,
          {
            idempotency_key: crypto.randomUUID(),
            product_revision: revision++,
            revision: window.revision,
            currency: 'COP',
            expected_timezone: 'America/Bogota',
            name: window.name,
            weekday: window.weekday,
            start_time: window.start_time,
            end_time: window.end_time,
            ends_next_day: true,
            valid_from: null,
            valid_until: null,
            is_active: active,
          },
        )
      ).data
    }
  }
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`/productos/${product.id}`)
  await expect(page.getByText('Horario habilitado', { exact: true })).toBeVisible()
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Horarios de disponibilidad', exact: true }) })
    .screenshot({
      path: '../docs/screenshots/availability-admin-desktop.png',
      animations: 'disabled',
    })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const registers = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  await writeApi(page, 'POST', `cash/registers/${registers.data[0].id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '1000',
    currency: 'COP',
  })
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Agregar Pizza horario', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige la presentación · Pizza horario', exact: true })
    .getByRole('button', { name: /Grande/ })
    .click()
  await page.getByRole('checkbox', { name: /Queso/ }).check()
  await page.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await page
    .getByLabel('Observación para Pizza horario', { exact: true })
    .fill('Conservar aunque cierre')
  await activeWindows(false)
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('fuera del horario de disponibilidad')
  expect((await readApi<{ meta: { total: number } }>(page, 'orders')).meta.total).toBe(0)
  await page
    .getByRole('button', { name: 'Revisar precios conservando el pedido', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(2)
  await expect(page.getByLabel('Observación para Pizza horario', { exact: true })).toHaveValue(
    'Conservar aunque cierre',
  )
  await activeWindows(true)
  await page
    .getByRole('button', { name: 'Revisar precios conservando el pedido', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const orderBodies: string[] = []
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    orderBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (orderBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
  await activeWindows(false)
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  expect(orderBodies).toHaveLength(2)
  expect(orderBodies[0]).toBe(orderBodies[1])
  const order = (await readApi<{ data: Order }>(page, `orders/${page.url().split('/').at(-1)!}`))
    .data
  expect(order.subtotal).toBe('122.5100')
  expect(order.items![0].availability_snapshot!.enabled).toBe(true)
  expect(order.items![0].availability_snapshot!.allowed).toBe(true)
  expect(order.items![0].availability_snapshot!.timezone).toBe('America/Bogota')
  expect(order.items![0].availability_snapshot!.windows[0].name).toMatch(/^Servicio [1-7]$/)
  await expect(page.locator('.saved-order-item')).toContainText('Horario comprobado al registrar')
  expect((await current()).availability_context!.allowed).toBe(false)
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await expect(page.locator('.checkout-summary')).toContainText('Horario comprobado al registrar')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('150')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText('Conservar aunque cierre')
  await expect(page.getByRole('article')).toContainText('Horario comprobado al registrar')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/availability-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})
