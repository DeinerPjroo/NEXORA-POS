import { expect, test } from '@playwright/test'
import { fixtureWorkspace, readApi } from './helpers'

test('denegación real conserva403, historial propio sin secretos y muestra el evento al lector autorizado', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await fixtureWorkspace(page, 'Auditoría de acceso', ['dashboard.view', 'audit.view'])
  await page.request.get('/sanctum/csrf-cookie')
  const token = (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')!
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post('/api/v1/categories?signature=Private-Signed-Value', {
      headers: {
        Accept: 'application/json',
        Origin: 'http://127.0.0.1:5199',
        'X-XSRF-TOKEN': decodeURIComponent(token.value),
      },
      data: { name: 'Unauthorized-Category', password: 'Never-Log-This-Value', tenant_id: 999999 },
    })
    expect(response.status()).toBe(403)
  }
  const overview = await readApi<{
    activity: { action: string; description: string; metadata: unknown }[]
  }>(page, 'workspace/overview')
  const events = overview.activity.filter((item) => item.action === 'access.denied')
  expect(events).toHaveLength(1)
  expect(events[0].metadata).toEqual({ status: 403, method: 'POST', route: 'api/v1/categories' })
  expect(JSON.stringify(events)).not.toContain('Never-Log-This-Value')
  expect(JSON.stringify(events)).not.toContain('Private-Signed-Value')
  expect(JSON.stringify(events)).not.toContain('Unauthorized-Category')
  await page.reload()
  await page.getByText('Tu empresa e identidad visual', { exact: true }).click()
  await expect(
    page.getByText('Se rechazó una acción por permisos o estado de la cuenta.', { exact: true }),
  ).toBeVisible()
})
