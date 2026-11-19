import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

const headers = { Accept: 'application/json', Origin: 'http://127.0.0.1:5199' }
function totp(secret: string, future = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + future))
  const digest = createHmac('sha1', key).update(counter).digest()
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, '0')
}

test('MFA real: QR, activación, revocación de otra sesión y desafío antes de entrar', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000)
  const { email, password } = await fixtureWorkspace(page, 'MFA aplicación')
  const separate = await browser.newContext({ baseURL: 'http://127.0.0.1:5199' })
  try {
    const peer = await separate.newPage()
    await peer.goto('/ingresar')
    await peer.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await peer.getByLabel('Contraseña', { exact: true }).fill(password)
    await peer.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
    await expect(peer.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
    await page.goto('/mi-seguridad')
    await page.getByLabel('Contraseña para MFA', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Configurar aplicación', exact: true }).click()
    const secret = (await page.getByTestId('mfa-enrollment-secret').textContent())!
    const qr = page.getByRole('img', { name: 'QR para configurar tu aplicación autenticadora' })
    await expect(qr).toBeVisible()
    expect(await qr.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await page.getByLabel('Código MFA de la aplicación', { exact: true }).fill(totp(secret))
    let failedRefresh = false
    await page.route('**/api/v1/auth/mfa', async (route) => {
      if (route.request().method() === 'GET' && !failedRefresh) {
        failedRefresh = true
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Fallo de consulta posterior a activar' }),
        })
      } else await route.continue()
    })
    await page.getByRole('button', { name: 'Activar MFA', exact: true }).click()
    await expect(
      page.getByRole('list', { name: 'Códigos de recuperación' }).getByRole('listitem'),
    ).toHaveCount(8)
    await page.getByRole('button', { name: 'Ya guardé mis códigos', exact: true }).click()
    await expect(page.getByText('MFA activo', { exact: true })).toBeVisible()
    expect(failedRefresh).toBe(true)
    await expect(qr).toHaveCount(0)
    await page
      .locator('.mfa-panel')
      .screenshot({ path: '../docs/screenshots/mfa-active-desktop.png' })
    expect((await peer.request.get('/api/v1/branches', { headers })).status()).toBe(401)
    await peer.reload()
    await expect(
      peer.getByRole('button', { name: 'Entrar a mi espacio', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Confirma tu segundo factor', exact: true }),
    ).toBeVisible()
    expect((await page.request.get('/api/v1/auth/me', { headers })).status()).toBe(401)
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .locator('.auth-form-wrap')
      .screenshot({ path: '../docs/screenshots/mfa-challenge-mobile.png' })
    await page.getByLabel('Código de tu aplicación', { exact: true }).fill(totp(secret, 1))
    await page.getByRole('button', { name: 'Confirmar segundo factor', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
    expect((await readApi<{ enabled: boolean }>(page, 'auth/mfa')).enabled).toBe(true)
  } finally {
    await separate.close()
  }
})

test('recuperación de un solo uso, renovación y desactivación con segundo factor', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const { email, password } = await fixtureWorkspace(page, 'MFA recuperación')
  const setup = await writeApi<{ secret: string; revision: number; pending_id: string }>(
    page,
    'POST',
    'auth/mfa/setup',
    { current_password: password, revision: 1 },
  )
  const active = await writeApi<{ recovery_codes: string[] }>(page, 'POST', 'auth/mfa/enable', {
    current_password: password,
    revision: setup.revision,
    pending_id: setup.pending_id,
    credential: totp(setup.secret),
  })
  async function enter() {
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Confirma tu segundo factor', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Usar código de recuperación', exact: true }).click()
  }
  await enter()
  await page.getByLabel('Código de recuperación', { exact: true }).fill(active.recovery_codes[0])
  await page.getByRole('button', { name: 'Confirmar segundo factor', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  await enter()
  await page.getByLabel('Código de recuperación', { exact: true }).fill(active.recovery_codes[0])
  await page.getByRole('button', { name: 'Confirmar segundo factor', exact: true }).click()
  await expect(
    page.getByText('El código no es válido o ya se utilizó.', { exact: false }),
  ).toBeVisible()
  await page.getByLabel('Código de recuperación', { exact: true }).fill(active.recovery_codes[1])
  await page.getByRole('button', { name: 'Confirmar segundo factor', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  await page.goto('/mi-seguridad')
  await expect(page.getByText('Quedan 6 códigos de recuperación.', { exact: true })).toBeVisible()
  await page.getByLabel('Contraseña para MFA', { exact: true }).fill(password)
  await page.getByLabel('Segundo factor', { exact: true }).selectOption('recovery')
  await page
    .getByLabel('Código MFA de recuperación', { exact: true })
    .fill(active.recovery_codes[2])
  await page.getByRole('button', { name: 'Renovar códigos de recuperación', exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Códigos de recuperación' }).getByRole('listitem'),
  ).toHaveCount(8)
  const codes = await page
    .getByRole('list', { name: 'Códigos de recuperación' })
    .getByRole('listitem')
    .allTextContents()
  expect(codes).toHaveLength(8)
  await page.getByRole('button', { name: 'Ya guardé mis códigos', exact: true }).click()
  await page.getByLabel('Acción MFA', { exact: true }).selectOption('disable')
  await page.getByLabel('Contraseña para MFA', { exact: true }).fill(password)
  await page.getByLabel('Código MFA de recuperación', { exact: true }).fill(codes[0])
  await page.getByRole('button', { name: 'Desactivar MFA', exact: true }).click()
  await expect(page.getByText('MFA sin activar', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
})
