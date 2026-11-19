import { expect, test } from '@playwright/test'
import { fixtureWorkspace, readApi } from './helpers'

test('correo pendiente, envío local indisponible y enlace conservado al ingresar', async ({
  page,
}) => {
  test.setTimeout(100_000)
  const { email, password } = await fixtureWorkspace(page, 'Correo pendiente')
  await page.goto('/mi-seguridad')
  await expect(page.getByText('Correo pendiente de verificación', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Solicitar enlace de verificación', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText('El servicio de correo todavía no está configurado.', { exact: false }),
  ).toBeVisible()
  await page
    .locator('.security-page')
    .screenshot({ path: '../docs/screenshots/email-verification-desktop.png' })
  const me = await readApi<{ user: { id: number } }>(page, 'auth/me')
  // Syntactically valid link with an invalid signature: the real server must reject it.
  const signed = `/api/v1/auth/email/verify/${me.user.id}/${'a'.repeat(40)}?expires=9999999999&signature=${'0'.repeat(64)}`
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Entrar a mi espacio', exact: true })).toBeVisible()
  await page.goto(`/verificar-correo?verificacion=${encodeURIComponent(signed)}`)
  await expect(page).toHaveURL(/\/ingresar\?verificar=/)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Verificar mi correo', exact: true }),
  ).toBeVisible()
  const response = page.waitForResponse(
    (r) => r.url().includes('/auth/email/verify/') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Confirmar verificación', exact: true }).click()
  expect((await response).status()).toBe(403)
  expect(
    (await readApi<{ user: { email_verified_at: string | null } }>(page, 'auth/me')).user
      .email_verified_at,
  ).toBeNull()
  await page.goto(
    `/verificar-correo?verificacion=${encodeURIComponent('https://example.test/externo')}`,
  )
  await expect(page.getByText('El enlace no es válido.', { exact: false })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Confirmar verificación', exact: true }),
  ).toHaveCount(0)
  await page.goto('/mi-seguridad')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByText('El servicio de correo todavía no está configurado.', { exact: false }),
  ).toBeVisible()
  await page
    .locator('.email-verification-panel')
    .screenshot({ path: '../docs/screenshots/email-verification-mobile.png' })
})

test('estado verificado proviene de la cuenta y no solicita otro envío', async ({ page }) => {
  test.setTimeout(70_000)
  await fixtureWorkspace(page, 'Correo confirmado', undefined, { emailVerified: true })
  await page.goto('/mi-seguridad')
  await expect(page.getByText('Correo verificado', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Solicitar enlace de verificación', exact: true }),
  ).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Correo verificado', { exact: true })).toBeVisible()
})
