import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const password = 'SeguraNexora123'
async function register(page: Page, suffix: string) {
  const email = `e2e-${Date.now()}-${suffix}@example.test`
  await page.goto('/registro')
  await page.getByLabel('Nombre del restaurante', { exact: true }).fill(`Casa Oliva ${suffix}`)
  await page.getByLabel('Tu nombre', { exact: true }).fill('Ana Pérez')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByLabel('Confirma tu contraseña').fill(password)
  await page.getByRole('button', { name: 'Crear mi espacio de trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  return email
}

test('registro, sucursal, rol, identidad visual, persistencia y cierre de sesión', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const email = await register(page, 'principal')
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({ path: '../docs/screenshots/overview.png', fullPage: true })
  await page.getByRole('link', { name: 'Sucursales', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva sucursal' }).click()
  await page.getByLabel('Nombre de la sucursal', { exact: true }).fill('Sede Chapinero')
  await page.getByLabel('Código interno', { exact: true }).fill('CHAPINERO')
  await page.getByLabel('Ciudad', { exact: true }).fill('Bogotá')
  await page.getByLabel('Dirección', { exact: true }).fill('Calle 60 # 8-20')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sede Chapinero', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Editar Sede Chapinero', exact: true }).click()
  await page.getByLabel('Teléfono', { exact: true }).fill('3001234567')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('3001234567', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Roles y permisos', exact: true }).click()
  await page.getByRole('button', { name: 'Crear rol', exact: true }).click()
  await page.getByLabel('Nombre del rol', { exact: true }).fill('Supervisor de sede')
  await page.getByLabel('Consultar sucursales', { exact: true }).check()
  await page.getByRole('button', { name: 'Guardar rol', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Supervisor de sede', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Nexora Studio', exact: false }).first().click()
  await page.getByLabel('Código del color principal').fill('#55CCDD')
  await page.getByRole('button', { name: 'Oscuro', exact: true }).click()
  await page.getByRole('button', { name: 'Publicar identidad', exact: true }).click()
  await expect(page.getByText('Versión 2 publicada', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Código del color principal')).toHaveValue('#55CCDD')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: '../docs/screenshots/studio-dark.png', fullPage: true })
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sesiones activas', exact: true })).toBeVisible()
  await expect(page.getByText('Este dispositivo', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu próximo gran paso.', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  expect(errors).toEqual([])
})

test('móvil: navegación, diálogos y ausencia de desplazamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ingresar')
  await expect(
    page.getByRole('heading', { name: 'Tu próximo gran paso.', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: '../docs/screenshots/login-mobile.png', fullPage: true })
  await register(page, 'movil')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('link', { name: 'Sucursales', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva sucursal' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('link', { name: 'Nexora Studio', exact: false }).first().click()
  await expect(page.getByRole('heading', { name: 'Se siente como tú.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await expect(page.getByLabel('Código del color principal')).toBeVisible()
  await page.screenshot({
    path: '../docs/screenshots/studio-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})

test('peticiones del navegador sin token CSRF son rechazadas', async ({ request }) => {
  const response = await request.post('/api/v1/auth/login', {
    headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
    data: { email: 'invalid@example.test', password: 'incorrecta' },
  })
  expect(response.status()).toBe(419)
})

test('inicio de sesión muestra errores reales del servidor', async ({ page }) => {
  await page.goto('/ingresar')
  await page.getByLabel('Correo electrónico').fill('nadie@example.test')
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta')
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click()
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos.')
  await page.screenshot({ path: '../docs/screenshots/login-desktop.png', fullPage: true })
})
