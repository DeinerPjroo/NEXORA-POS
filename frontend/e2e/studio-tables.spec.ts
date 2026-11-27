import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Studio Mesas: preview real, plantilla, guardado incierto y publicación sin ocupar mesas', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await fixtureWorkspace(page, 'Studio Mesas')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const room = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Salón Studio',
      color: '#7255db',
      is_active: true,
    })
  ).data
  await writeApi(page, 'POST', `dining-rooms/${room.id}/tables`, {
    idempotency_key: crypto.randomUUID(),
    room_revision: 1,
    name: 'Mesa Studio 1',
    shape: 'square',
    capacity: 4,
    color: '#7255db',
    is_active: true,
  })
  await page.goto('/admin/studio/mesas')
  const editor = page.getByRole('region', { name: 'Editor de Mesas' })
  const frame = page.frameLocator('iframe')
  const card = frame.locator('.digital-table')
  await expect(card).toContainText('Mesa Studio 1')
  await expect(frame.locator('.studio-pos-render')).toHaveAttribute('inert', '')
  await editor.getByRole('button', { name: 'Mesas Compactas', exact: true }).click()
  await expect(editor.getByLabel('Ancho de mesa', { exact: true })).toHaveValue('130')
  await expect(card).toHaveCSS('width', '130px')
  await expect(card.locator('.digital-table-symbol')).toBeHidden()
  await expect(card.locator('.digital-table-state')).toHaveText('Libre')
  expect(
    (await readApi<{ data: { revision: number } }>(page, 'studio/tables/active')).data.revision,
  ).toBe(0)
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/studio/tables/draft'))
      bodies.push(request.postDataJSON())
  })
  await page.route(
    '**/api/v1/studio/tables/draft',
    async (route) => {
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(
    editor.getByRole('button', { name: 'Reintentar guardado', exact: true }),
  ).toBeEnabled()
  await expect(editor.getByLabel('Ancho de mesa', { exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Reintentar guardado', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 2')
  expect((await readApi<{ data: unknown }>(page, 'studio/pos')).data).toBeNull()
  await page.goto('/terminal/mesas')
  await expect(page.locator('.digital-table')).toHaveCSS('width', '130px')
  await expect(page.locator('.digital-table-state')).toHaveText('Libre')
  expect(
    (await readApi<{ meta: { total: number } }>(page, 'dining-sessions?status=open')).meta.total,
  ).toBe(0)
})
