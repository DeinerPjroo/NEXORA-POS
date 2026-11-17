import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function readApi<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1/${path}`, {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
  })
  expect(response.ok()).toBe(true)
  return response.json()
}

export async function registerWorkspace(page: Page, name: string, prefix: string) {
  await page.goto('/registro')
  await page.getByLabel('Nombre del restaurante', { exact: true }).fill(name)
  await page.getByLabel('Tu nombre', { exact: true }).fill('Ana Pérez')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`${prefix}-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Contraseña', { exact: true }).fill('SeguraNexora123')
  await page.getByLabel('Confirma tu contraseña').fill('SeguraNexora123')
  await page.getByRole('button', { name: 'Crear mi espacio de trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
}

export async function writeApi<T>(
  page: Page,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
): Promise<T> {
  await page.request.get('/sanctum/csrf-cookie')
  const cookie = (await page.context().cookies()).find((item) => item.name === 'XSRF-TOKEN')!
  const response = await page.request.fetch(`/api/v1/${path}`, {
    method,
    data: body,
    headers: {
      Origin: 'http://127.0.0.1:5199',
      Accept: 'application/json',
      'X-XSRF-TOKEN': decodeURIComponent(cookie.value),
    },
  })
  expect(response.ok()).toBe(true)
  return response.json()
}
