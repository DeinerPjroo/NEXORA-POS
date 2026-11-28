import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Fondos de cambio: entrega, respuesta perdida y devolucion parcial conservan efectivo', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await fixtureWorkspace(page, 'Fondos de cambio')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const role = (await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')).roles.find(
    (r) => r.name === 'Repartidor',
  )!.id
  await writeApi(page, 'POST', 'employees', {
    idempotency_key: crypto.randomUUID(),
    name: 'Diego fondos',
    email: `fund-${crypto.randomUUID()}@example.test`,
    role_id: role,
    is_active: true,
    branch_ids: [branch],
    password: 'RepartidorSeguro123',
    password_confirmation: 'RepartidorSeguro123',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0].id
  const { data: cash } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${register}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000.00', currency: 'COP' },
  )
  await page.goto('/terminal/domicilios')
  await page.getByRole('button', { name: 'Fondos de cambio', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Fondos de cambio de repartidores', exact: true })
  await modal.getByRole('button', { name: /Diego fondos/ }).click()
  await modal.getByLabel('Caja que entrega o recibe', { exact: true }).selectOption(String(cash.id))
  await modal.getByLabel('Importe del fondo').fill('100.01')
  await modal.getByLabel('Motivo del traslado').fill('Fondo físico para cambio')
  await expect(
    modal.getByRole('button', { name: 'Confirmar traslado de efectivo', exact: true }),
  ).toBeDisabled()
  await modal.getByLabel('Confirmo que el efectivo se entrega o recibe físicamente').check()
  const payloads: string[] = []
  await page.route('**/api/v1/deliveries/couriers/*/cash', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    payloads.push(route.request().postData()!)
    const response = await route.fetch()
    if (payloads.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await modal.getByRole('button', { name: 'Confirmar traslado de efectivo', exact: true }).click()
  await expect(
    modal.getByRole('button', { name: 'Reintentar mismo traslado', exact: true }),
  ).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Volver a fondos', exact: true })).toBeDisabled()
  await expect(page.locator('.terminal-header')).toHaveAttribute('inert', '')
  await modal.getByRole('button', { name: 'Reintentar mismo traslado', exact: true }).click()
  await expect(modal.getByRole('button', { name: /Diego fondos/ })).toBeVisible()
  expect(payloads).toHaveLength(2)
  expect(payloads[0]).toBe(payloads[1])
  await modal.getByRole('button', { name: /Diego fondos/ }).click()
  await modal.getByLabel('Movimiento del fondo').selectOption('return')
  await modal.getByLabel('Caja que entrega o recibe').selectOption(String(cash.id))
  await modal.getByLabel('Importe del fondo').fill('40.01')
  await modal.getByLabel('Motivo del traslado').fill('Devolución parcial recibida')
  await modal.getByLabel('Confirmo que el efectivo se entrega o recibe físicamente').check()
  await modal.getByRole('button', { name: 'Confirmar traslado de efectivo', exact: true }).click()
  await expect(modal.getByRole('button', { name: /Diego fondos/ })).toBeVisible()
  const funds = await readApi<{ data: { name: string; balance: string; revision: number }[] }>(
    page,
    `deliveries/courier-cash?branch_id=${branch}`,
  )
  expect(funds.data.find((row) => row.name === 'Diego fondos')).toMatchObject({
    balance: '60.0000',
    revision: 2,
  })
  expect(
    (
      await readApi<{ data: { expected_amount: string; revision: number } }>(
        page,
        `cash/sessions/${cash.id}`,
      )
    ).data,
  ).toMatchObject({ expected_amount: '940.0000', revision: 3 })
  expect((await readApi<{ data: unknown[] }>(page, 'sales')).data).toEqual([])
  expect(
    (await readApi<{ data: unknown[] }>(page, `cash/sessions/${cash.id}/movements`)).data,
  ).toHaveLength(2)
  expect(errors).toEqual([])
})
