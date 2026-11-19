import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import { reservationTimes, localMinute } from '../src/features/dining/reservation-time'

test('Reservas: zona de empresa, horas repetidas, inexistentes y desplazamiento de 45 minutos', () => {
  expect(reservationTimes('2027-03-14T02:30', 'America/New_York')).toEqual([])
  expect(reservationTimes('2027-11-07T01:30', 'America/New_York')).toEqual([
    '2027-11-07T01:30:00-04:00',
    '2027-11-07T01:30:00-05:00',
  ])
  expect(reservationTimes('2026-11-19T13:00', 'America/Bogota')).toEqual([
    '2026-11-19T13:00:00-05:00',
  ])
  expect(reservationTimes('2026-11-19T13:00', 'Asia/Kathmandu')).toEqual([
    '2026-11-19T13:00:00+05:45',
  ])
  expect(reservationTimes('2027-02-30T13:00', 'America/Bogota')).toEqual([])
})

test('Reservas: creación incierta, cruce rechazado, llegada con mesas reales e historial de cancelación', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await fixtureWorkspace(page, 'Reservas Nexora')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const room = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Reservaciones',
      color: '#F5F7FB',
      is_active: true,
    })
  ).data
  for (let n = 1; n <= 2; n++)
    await writeApi(page, 'POST', 'dining-rooms/' + room.id + '/tables', {
      idempotency_key: crypto.randomUUID(),
      room_revision: n,
      name: 'Mesa ' + n,
      shape: 'circle',
      color: '#DCD6FF',
      capacity: 4,
      is_active: true,
    })
  const start = localMinute(Date.now() + 10 * 60000, 'America/Bogota')
  const end = localMinute(Date.now() + 70 * 60000, 'America/Bogota')
  await page.goto('/salones/reservas')
  async function fill(name: string) {
    await page.getByRole('button', { name: 'Nueva reserva', exact: true }).click()
    await page.getByLabel('Nombre de quien reserva', { exact: true }).fill(name)
    await page.getByLabel('Sucursal de la reserva', { exact: true }).selectOption(String(branch))
    await page.getByLabel('Inicio de la reserva', { exact: true }).fill(start)
    await page.getByLabel('Fin de la reserva', { exact: true }).fill(end)
    await page.getByRole('checkbox', { name: /Mesa 1/ }).check()
  }
  await fill('María Reserva')
  await page.getByLabel('Teléfono de contacto', { exact: true }).fill('3001234567')
  await page.getByLabel('Personas de la reserva', { exact: true }).fill('5')
  await page.getByRole('checkbox', { name: /Mesa 2/ }).check()
  const bodies: string[] = []
  await page.route('**/api/v1/dining-reservations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar reserva', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar misma reserva', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Nombre de quien reserva', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar misma reserva', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Nueva reserva', exact: true })).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toBe(bodies[0])
  await fill('Reserva Cruzada')
  await page.getByRole('button', { name: 'Guardar reserva', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('cruza este horario')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  mkdirSync('../docs/screenshots', { recursive: true })
  await expect(page.getByText('María Reserva', { exact: true })).toBeVisible()
  await page.locator('.page-content').screenshot({
    path: '../docs/screenshots/dining-reservations-desktop.png',
    animations: 'disabled',
  })
  await page
    .getByRole('button', { name: 'Registrar llegada de María Reserva', exact: true })
    .click()
  await page
    .getByLabel('Mesero para la llegada', { exact: true })
    .selectOption({ label: 'Ana Pérez' })
  await page.getByRole('button', { name: 'Confirmar llegada', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Registrar llegada', exact: true })).toHaveCount(0)
  await page.getByLabel('Estado de reservas', { exact: true }).selectOption('arrived')
  await expect(page.getByRole('link', { name: /Ver atención #/ })).toBeVisible()
  const sessions = (
    await readApi<{ data: { id: number; guest_count: number; waiter_name: string }[] }>(
      page,
      'dining-sessions?status=open',
    )
  ).data
  expect(sessions).toHaveLength(1)
  expect(sessions[0].guest_count).toBe(5)
  expect(sessions[0].waiter_name).toBe('Ana Pérez')
  const tables = (
    await readApi<{ data: { id: number; revision: number }[] }>(
      page,
      'dining/reservation-tables?branch_id=' + branch,
    )
  ).data
  await writeApi(page, 'POST', 'dining-reservations', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    expected_timezone: 'America/Bogota',
    guest_name: 'Cliente Cancelado',
    guest_count: 2,
    starts_at: reservationTimes(
      localMinute(Date.now() + 130 * 60000, 'America/Bogota'),
      'America/Bogota',
    )[0],
    ends_at: reservationTimes(
      localMinute(Date.now() + 190 * 60000, 'America/Bogota'),
      'America/Bogota',
    )[0],
    tables: [{ id: tables[0].id, revision: tables[0].revision }],
  })
  await page.getByLabel('Estado de reservas', { exact: true }).selectOption('booked')
  await page
    .getByRole('button', { name: 'Cancelar reserva de Cliente Cancelado', exact: true })
    .click()
  await page.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Cancelar reserva', exact: true })).toHaveCount(0)
  await page.getByLabel('Estado de reservas', { exact: true }).selectOption('cancelled')
  await expect(page.getByText('Cliente Cancelado', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.page-content').screenshot({
    path: '../docs/screenshots/dining-reservations-mobile.png',
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Reservas: rol de recepción inicia en reservas y no obtiene controles de ocupación', async ({
  page,
}) => {
  await fixtureWorkspace(page, 'Recepción', ['dining.reserve'])
  await expect(page).toHaveURL(/\/salones\/reservas$/)
  await expect(page.getByRole('heading', { name: 'Reservas de mesas', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Salones y mesas', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nueva reserva', exact: true })).toBeVisible()
  const denied = await page.request.get('/api/v1/dining-sessions', {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
  })
  expect(denied.status()).toBe(403)
})
