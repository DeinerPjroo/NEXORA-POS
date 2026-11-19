import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { DiningRoom } from '../src/features/dining/types'

async function fixture(page: import('@playwright/test').Page) {
  await fixtureWorkspace(page, 'Plano Nexora')
  const context = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const { data: room } = await writeApi<{ data: DiningRoom }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: context.branches[0].id,
    name: 'Terraza',
    color: '#F5F7FB',
    is_active: true,
  })
  await writeApi(page, 'POST', 'dining-rooms/' + room.id + '/tables', {
    idempotency_key: crypto.randomUUID(),
    room_revision: room.revision,
    name: 'Mesa 1',
    shape: 'rectangle',
    color: '#DCD6FF',
    capacity: 4,
    is_active: true,
  })
  return (await readApi<{ data: DiningRoom }>(page, 'dining-rooms/' + room.id)).data
}

test('Salones: creación UI, geometría, arrastre, objetos y persistencia móvil', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await fixtureWorkspace(page, 'Salones UI')
  await page.goto('/salones')
  await page.getByRole('button', { name: 'Nuevo salón', exact: true }).click()
  await page.getByLabel('Nombre del salón', { exact: true }).fill('Interior')
  await page.getByLabel('Sucursal', { exact: true }).selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Guardar salón', exact: true }).click()
  await page.getByRole('link', { name: 'Ver mesas y plano', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click()
  await page.getByLabel('Nombre de la mesa', { exact: true }).fill('Mesa A')
  await page.getByLabel('Forma', { exact: true }).selectOption('rectangle')
  await page.getByLabel('Capacidad', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Guardar mesa', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Mesa A', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Editar distribución', exact: true }).click()
  await page.getByLabel('Elemento seleccionado', { exact: true }).selectOption({ label: 'Mesa A' })
  await page.getByLabel('Ancho', { exact: true }).fill('160')
  await page.getByLabel('Alto', { exact: true }).fill('90')
  await page.getByLabel('Rotación', { exact: true }).fill('30')
  await page.getByLabel('Posición X', { exact: true }).fill('300')
  await page.getByLabel('Posición Y', { exact: true }).fill('200')
  const table = page.getByRole('button', { name: 'Seleccionar Mesa A', exact: true })
  const box = (await table.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByLabel('Posición X', { exact: true })).not.toHaveValue('300')
  await page.getByLabel('Tipo de objeto').selectOption('door')
  await page.getByRole('button', { name: 'Agregar objeto', exact: true }).click()
  await page.getByLabel('Etiqueta', { exact: true }).fill('Entrada principal')
  await page.getByLabel('Posición X', { exact: true }).fill('50')
  await page.getByLabel('Posición Y', { exact: true }).fill('500')
  mkdirSync('../docs/screenshots', { recursive: true })
  await page
    .locator('.dining-layout')
    .screenshot({ path: '../docs/screenshots/dining-editor-desktop.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Guardar distribución', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Editar distribución', exact: true })).toBeVisible()
  const id = page.url().split('/').at(-1)!
  const saved = (await readApi<{ data: DiningRoom }>(page, 'dining-rooms/' + id)).data
  expect(saved.tables![0]).toMatchObject({ width: 160, height: 90, rotation: 30, capacity: 6 })
  expect(saved.tables![0].x).toBeGreaterThan(300)
  expect(saved.objects[0]).toMatchObject({
    kind: 'door',
    label: 'Entrada principal',
    x: 50,
    y: 500,
  })
  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Editar distribución', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Seleccionar Entrada principal', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Elemento seleccionado', { exact: true }).selectOption({ label: 'Mesa A' })
  await expect(page.getByLabel('Rotación', { exact: true })).toHaveValue('30')
  await page
    .locator('.dining-layout')
    .screenshot({ path: '../docs/screenshots/dining-editor-mobile.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Volver a las mesas', exact: true }).click()
  await page.getByRole('button', { name: 'Editar Mesa A', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Mesa activa', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Guardar mesa', exact: true }).click()
  await expect(page.getByText('No hay mesas en esta vista.', { exact: true })).toBeVisible()
  await page.getByLabel('Estado de mesas').selectOption('archived')
  await expect(page.getByRole('cell', { name: 'Mesa A', exact: true })).toBeVisible()
})

test('Salones: conflicto conserva borrador y respuesta perdida reintenta DTO y UUID exactos', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const room = await fixture(page)
  await page.goto('/salones/' + room.id)
  await page.getByRole('button', { name: 'Editar distribución', exact: true }).click()
  await page.getByLabel('Elemento seleccionado', { exact: true }).selectOption({ label: 'Mesa 1' })
  await page.getByLabel('Posición X', { exact: true }).fill('450')
  await writeApi(page, 'PUT', 'dining-rooms/' + room.id, {
    idempotency_key: crypto.randomUUID(),
    revision: room.revision,
    name: room.name,
    color: '#FFFFFF',
    is_active: true,
  })
  await page.getByRole('button', { name: 'Guardar distribución', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('El salón cambió')
  await expect(page.getByLabel('Posición X', { exact: true })).toHaveValue('450')
  await page.getByRole('button', { name: 'Volver a las mesas', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Editar distribución', exact: true }).click()
  await page.getByLabel('Elemento seleccionado', { exact: true }).selectOption({ label: 'Mesa 1' })
  await page.getByLabel('Posición X', { exact: true }).fill('420')
  const bodies: string[] = []
  await page.route('**/api/v1/dining-rooms/' + room.id + '/layout', async (route) => {
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar distribución', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar mismo guardado', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Posición X', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Volver a las mesas', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar mismo guardado', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Editar distribución', exact: true })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toBe(bodies[0])
  const fresh = (await readApi<{ data: DiningRoom }>(page, 'dining-rooms/' + room.id)).data
  expect(fresh.revision).toBe(room.revision + 2)
  expect(fresh.tables![0].x).toBe(420)
})

test('Salones: lector inicia en su módulo sin controles de administración', async ({ page }) => {
  await fixtureWorkspace(page, 'Lector de salones', ['dining.view'])
  await expect(page).toHaveURL(/\/salones$/)
  await expect(page.getByRole('heading', { name: 'Salones y mesas', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo salón', exact: true })).toHaveCount(0)
  await page.request.get('/sanctum/csrf-cookie')
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')!
  const denied = await page.request.post('/api/v1/dining-rooms', {
    headers: {
      Origin: 'http://127.0.0.1:5199',
      Accept: 'application/json',
      'X-XSRF-TOKEN': decodeURIComponent(csrf.value),
    },
    data: {},
  })
  expect(denied.status()).toBe(403)
})
