import { expect, test } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('PIN propio, bloqueo entre pestañas y borrador intacto al desbloquear', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  const { password } = await fixtureWorkspace(page, 'Seguridad PIN')
  await page.getByRole('link', { name: 'Seguridad personal', exact: true }).click()
  await page.getByLabel('Contraseña actual', { exact: true }).fill(password)
  await page.getByLabel('Nuevo PIN de 6 dígitos').fill('839205')
  await page.getByLabel('Confirmar PIN', { exact: true }).fill('839205')
  await page.getByRole('button', { name: 'Guardar PIN', exact: true }).click()
  await expect(page.getByText('Tienes un PIN configurado.', { exact: false })).toBeVisible()
  await page.goto('/pedidos/nuevo')
  await page.getByLabel('Observación general').fill('Conservar mi borrador al bloquear')
  const peer = await context.newPage()
  await peer.goto('/mi-seguridad')
  await expect(peer.getByRole('heading', { name: 'Seguridad personal' })).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear pantalla', exact: true }).click()
  const lock = page.getByRole('dialog', { name: 'Pantalla bloqueada' })
  await expect(lock).toBeVisible()
  await expect(peer.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeVisible()
  await expect(page.locator('.app-shell')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(lock).toBeVisible()
  const denied = await page.request.get('/api/v1/orders', {
    headers: { Accept: 'application/json', Origin: 'http://127.0.0.1:5199' },
  })
  expect(denied.status()).toBe(423)
  await page.screenshot({ path: '../docs/screenshots/screen-lock-desktop.png', fullPage: true })
  await lock.getByLabel('Tu PIN de 6 dígitos').fill('000000')
  await lock.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(lock.getByText('No se pudo desbloquear.', { exact: false })).toBeVisible()
  await lock.getByLabel('Tu PIN de 6 dígitos').fill('839205')
  await lock.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(lock).toBeHidden()
  await expect(peer.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeHidden()
  await expect(page.getByLabel('Observación general')).toHaveValue(
    'Conservar mi borrador al bloquear',
  )
  await peer.close()
  await page.getByRole('button', { name: 'Bloquear pantalla', exact: true }).click()
  await expect(lock).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '../docs/screenshots/screen-lock-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Usar mi contraseña', exact: true }).click()
  await page.getByLabel('Tu contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeHidden()
})

test('cobro incierto conserva cuerpo y UUID al bloquear y reintentar sin duplicar', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const { password } = await fixtureWorkspace(page, 'Seguridad cobro')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Plato protegido',
    sku: 'LOCK-CASH',
    category_id: category.id,
    sale_price: '10.01',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0].id
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', `cash/registers/${register}/open`, {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '100',
      currency: 'COP',
    })
  ).data
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Plato protegido', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  const bodies: string[] = []
  await page.route('**/api/v1/orders/*/collect', async (route) => {
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar cobro', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear pantalla', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeVisible()
  await page.getByLabel('Tu contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeHidden()
  await expect(page.getByLabel('Efectivo recibido', { exact: true })).toHaveValue('20')
  await page.getByRole('button', { name: 'Reintentar cobro', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  const saleId = Number(page.url().split('/').at(-1))
  const sale = (
    await readApi<{ data: { payments: unknown[]; total: string } }>(page, `sales/${saleId}`)
  ).data
  expect(sale.payments).toHaveLength(1)
  expect(sale.total).toBe('10.0100')
  const session = (
    await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)
  ).data
  expect(session.expected_amount).toBe('110.0100')
})

test('contraseña de respaldo, retirada de PIN y aislamiento de sesiones', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  const { email, password } = await fixtureWorkspace(page, 'Seguridad sesiones')
  await page.goto('/mi-seguridad')
  await page.getByLabel('Contraseña actual', { exact: true }).fill(password)
  await page.getByLabel('Nuevo PIN de 6 dígitos').fill('724619')
  await page.getByLabel('Confirmar PIN', { exact: true }).fill('724619')
  await page.getByRole('button', { name: 'Guardar PIN', exact: true }).click()
  await expect(page.getByText('Tienes un PIN configurado.', { exact: false })).toBeVisible()
  await page.getByLabel('Contraseña actual', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Quitar PIN', exact: true }).click()
  await expect(page.getByText('Todavía no tienes un PIN.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Bloquear pantalla', exact: true }).click()
  await expect(page.getByLabel('Tu contraseña', { exact: true })).toBeVisible()
  const separate = await browser.newContext({ baseURL: 'http://127.0.0.1:5199' })
  try {
    const other = await separate.newPage()
    await other.goto('/ingresar')
    await other.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await other.getByLabel('Contraseña', { exact: true }).fill(password)
    await other.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
    await expect(other.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
    const headers = { Accept: 'application/json', Origin: 'http://127.0.0.1:5199' }
    expect((await other.request.get('/api/v1/branches', { headers })).status()).toBe(200)
    expect((await page.request.get('/api/v1/branches', { headers })).status()).toBe(423)
    await expect(page.getByRole('dialog', { name: 'Pantalla bloqueada' })).toBeVisible()
  } finally {
    await separate.close()
  }
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Entrar a mi espacio', exact: true })).toBeVisible()
})
