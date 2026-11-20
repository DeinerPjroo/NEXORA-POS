import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi } from './helpers'

test('estaciones: creación, revisión, archivo y diseño móvil', async ({ page }) => {
  await fixtureWorkspace(page, 'Cocina Nexora')
  await page.goto('/cocina/estaciones')
  await page.getByRole('button', { name: 'Nueva estación', exact: true }).click()
  await page.getByLabel('Nombre de la estación', { exact: true }).fill('Parrilla')
  await page.getByLabel('Sucursal', { exact: true }).selectOption({ index: 1 })
  await page.getByLabel('Tiempo objetivo en minutos').fill('18')
  await page.getByRole('button', { name: 'Guardar estación', exact: true }).click()
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Parrilla', exact: true }) })
  await expect(card.getByText('Tiempo objetivo: 18 min', { exact: true })).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/kitchen-stations-desktop.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Editar estación Parrilla', exact: true }).click()
  await page.getByLabel('Estación activa', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Guardar estación', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parrilla', exact: true })).toHaveCount(0)
  await page.getByLabel('Estado de estaciones').selectOption('archived')
  await expect(card.getByText('Estación archivada', { exact: true })).toBeVisible()
  const response = await readApi<{ data: { revision: number }[] }>(
    page,
    'kitchen-stations?status=archived',
  )
  expect(response.data[0].revision).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(card).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: '../docs/screenshots/kitchen-stations-mobile.png', fullPage: true })
})

test('cocina: inicio propio de lector y acceso denegado sin permiso', async ({ page }) => {
  test.setTimeout(90_000)
  await fixtureWorkspace(page, 'Lector de cocina', ['kitchen.view'])
  await expect(page).toHaveURL(/\/cocina\/estaciones$/)
  await expect(
    page.getByRole('heading', { name: 'Estaciones de cocina', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva estación', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/ingresar$/)
  await fixtureWorkspace(page, 'Solo pedidos', ['orders.view'])
  await page.goto('/cocina/estaciones')
  await expect(page.getByRole('button', { name: 'Nueva estación', exact: true })).toHaveCount(0)
  const response = await page.request.get('/api/v1/kitchen-stations', {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
  })
  expect(response.status()).toBe(403)
})
