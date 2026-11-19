import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Preparación de fixtures; las pruebas de registro existentes siguen usando la UI y sus límites.
export async function fixtureWorkspace(page: Page, companyName: string, permissions?: string[]) {
  const backend = fileURLToPath(new URL('../../backend/', import.meta.url))
  const email = `fixture-${crypto.randomUUID()}@example.test`
  const password = `Fixture-${crypto.randomUUID()}A1`
  const result = spawnSync('php', [resolve(backend, '../scripts/create-e2e-workspace.php')], {
    cwd: backend,
    input: JSON.stringify({
      company_name: companyName,
      email,
      password,
      ...(permissions ? { permissions } : {}),
    }),
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      NEXORA_E2E_FIXTURE: '1',
      APP_ENV: 'testing',
      APP_DEBUG: 'false',
      APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
      DB_CONNECTION: 'sqlite',
      DB_DATABASE: resolve(backend, 'database/e2e.sqlite'),
      DB_URL: '',
      SESSION_DRIVER: 'array',
      CACHE_STORE: 'array',
      MAIL_MAILER: 'array',
      QUEUE_CONNECTION: 'sync',
      BCRYPT_ROUNDS: '4',
    },
  })
  expect(result.status, result.stderr || 'No se pudo preparar el fixture E2E aislado.').toBe(0)
  await page.goto('/ingresar')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
  if (permissions)
    await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible()
  else await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
}

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
