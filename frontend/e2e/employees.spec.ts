import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Empleados: alta segura, edición, PIN, revocación y acceso de cocinero/mesero', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)
  await fixtureWorkspace(page, 'Equipo operativo')
  const { branches } = await readApi<{ branches: { id: number; name: string }[] }>(
    page,
    'operations/context',
  )
  const branch = branches[0]
  const email = `chef-${crypto.randomUUID()}@example.test`
  const password = 'EmpleadoSeguro123'
  await page.goto('/equipo')
  await page.getByRole('button', { name: 'Nuevo empleado', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo empleado', exact: true })
  await dialog.getByLabel('Nombre del empleado', { exact: true }).fill('Chef operativo')
  await dialog.getByLabel('Correo de acceso', { exact: true }).fill(email)
  await dialog.getByLabel('Rol del empleado', { exact: true }).selectOption({ label: 'Cocinero' })
  await dialog.getByRole('checkbox', { name: branch.name, exact: true }).check()
  await dialog.getByLabel('Contraseña inicial', { exact: true }).fill(password)
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
  await dialog.getByLabel('PIN personal (opcional)', { exact: true }).fill('482951')
  const bodies: string[] = []
  await page.route('**/api/v1/employees', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await dialog.getByRole('button', { name: 'Guardar empleado', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'Reintentar mismo guardado', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Reintentar mismo guardado', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  const row = page.getByRole('row').filter({ hasText: email })
  await expect(row).toContainText('Cocinero')
  await row.getByRole('button', { name: 'Editar Chef operativo', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Editar empleado: Chef operativo', exact: true })
  await edit.getByLabel('Nombre del empleado', { exact: true }).fill('Chef de pizzas')
  await edit.getByRole('button', { name: 'Guardar empleado', exact: true }).click()
  await expect(row).toContainText('Chef de pizzas')
  await page.screenshot({ path: 'test-results/employees-admin.png' })
  const chefContext = await browser.newContext()
  const chef = await chefContext.newPage()
  await chef.goto('/ingresar')
  await chef.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await chef.getByLabel('Contraseña', { exact: true }).fill(password)
  await chef.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
  await expect(chef).toHaveURL(/\/terminal\/cocina$/)
  await expect(chef.getByRole('heading', { name: 'Comandas de cocina', exact: true })).toBeVisible()
  expect(
    (
      await chef.request.get('/api/v1/workspace/team', {
        headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
      })
    ).status(),
  ).toBe(403)
  await chef.getByRole('button', { name: 'Bloquear pantalla', exact: true }).click()
  await chef.getByLabel('Tu PIN de 6 dígitos', { exact: true }).fill('482951')
  await chef.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(chef.getByRole('dialog', { name: 'Pantalla bloqueada', exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: 'Accesos de Chef de pizzas', exact: true }).click()
  const access = page.getByRole('dialog', { name: 'Accesos de Chef de pizzas', exact: true })
  await access.getByLabel('Acción de seguridad', { exact: true }).selectOption('password')
  await access.getByLabel('Nueva contraseña', { exact: true }).fill('NuevaSegura987')
  await access.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('NuevaSegura987')
  await access.getByRole('button', { name: 'Confirmar cambio de acceso', exact: true }).click()
  await expect(access).toHaveCount(0)
  expect(
    (
      await chef.request.get('/api/v1/auth/me', {
        headers: { Origin: 'http://127.0.0.1:5199', Accept: 'application/json' },
      })
    ).status(),
  ).toBe(401)
  await row.getByRole('button', { name: 'Editar Chef de pizzas', exact: true }).click()
  const deactivate = page.getByRole('dialog', {
    name: 'Editar empleado: Chef de pizzas',
    exact: true,
  })
  await deactivate.getByLabel('Empleado activo', { exact: true }).uncheck()
  await deactivate.getByRole('button', { name: 'Guardar empleado', exact: true }).click()
  await expect(row).toContainText('Inactivo')

  const { roles } = await readApi<{ roles: { id: number; name: string }[] }>(page, 'roles')
  const waiterEmail = `waiter-${crypto.randomUUID()}@example.test`
  const { data: waiter } = await writeApi<{ data: { id: number } }>(page, 'POST', 'employees', {
    idempotency_key: crypto.randomUUID(),
    name: 'Mesero operativo',
    email: waiterEmail,
    role_id: roles.find((r) => r.name === 'Mesero')!.id,
    is_active: true,
    branch_ids: [branch.id],
    password,
    password_confirmation: password,
  })
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch.id,
    name: 'Salón equipo',
    color: '#7255db',
    is_active: true,
  })
  const { data: table } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `dining-rooms/${room.id}/tables`,
    {
      idempotency_key: crypto.randomUUID(),
      room_revision: 1,
      name: 'Mesa equipo',
      shape: 'square',
      color: '#258ca7',
      capacity: 4,
      is_active: true,
    },
  )
  const { data: attention } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    'dining-sessions',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch.id,
      tables: [{ id: table.id, revision: 1 }],
      guest_count: 2,
      waiter_id: waiter.id,
    },
  )
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta equipo',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza para mesero',
    sku: 'EMPLOYEE-PIZZA',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  const waiterContext = await browser.newContext()
  const waiterPage = await waiterContext.newPage()
  await waiterPage.goto('/ingresar')
  await waiterPage.getByLabel('Correo electrónico', { exact: true }).fill(waiterEmail)
  await waiterPage.getByLabel('Contraseña', { exact: true }).fill(password)
  await waiterPage.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click()
  await expect(waiterPage).toHaveURL(/\/terminal\/mesas$/)
  await waiterPage.goto(`/pos/atenciones/${attention.id}`)
  await waiterPage.getByRole('button', { name: 'Agregar Pizza para mesero', exact: true }).click()
  await expect(
    waiterPage.getByRole('button', { name: 'Continuar al cobro', exact: true }),
  ).toHaveCount(0)
  await waiterPage.getByRole('button', { name: 'GUARDAR EN MESA', exact: true }).click()
  await expect(
    waiterPage.getByRole('button', { name: 'ACTUALIZAR PEDIDO', exact: true }),
  ).toBeVisible()
  const { data: orders } = await readApi<{ data: { created_by: number }[] }>(page, 'orders')
  expect(orders).toHaveLength(1)
  await chefContext.close()
  await waiterContext.close()
})
