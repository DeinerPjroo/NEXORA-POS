import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi } from './helpers'

test('Studio: plantillas personales, reintento exacto, duplicar, renombrar y aplicar sin publicar', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await fixtureWorkspace(page, 'Plantillas propias')
  await page.goto('/admin/studio/pos')
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS' })
  const templates = page.getByRole('region', { name: 'Plantillas personales' })
  await editor.getByRole('button', { name: /^Compacta/ }).click()
  await templates.getByRole('button', { name: 'Guardar como plantilla', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Nombre de la plantilla').fill('Louis mostrador')
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/studio/pos/templates'))
      bodies.push(request.postDataJSON())
  })
  await page.route(
    '**/api/v1/studio/pos/templates',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await modal.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Reintentar mismo guardado' })).toBeVisible()
  await expect(modal.getByLabel('Nombre de la plantilla')).toBeDisabled()
  await expect(page.getByLabel('Dispositivo', { exact: true })).toBeDisabled()
  await modal.getByRole('button', { name: 'Reintentar mismo guardado' }).click()
  await expect(modal).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  const original = templates
    .locator('article')
    .filter({ has: page.getByText('Louis mostrador', { exact: true }) })
  await original.getByRole('button', { name: 'Duplicar', exact: true }).click()
  await modal.getByLabel('Nombre de la plantilla').fill('Louis salón')
  await modal.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
  const copy = templates
    .locator('article')
    .filter({ has: page.getByText('Louis salón', { exact: true }) })
  await copy.getByRole('button', { name: 'Renombrar', exact: true }).click()
  await modal.getByLabel('Nombre de la plantilla').fill('Louis táctil')
  await modal.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
  await expect(templates.locator('article')).toHaveCount(2)
  await expect(templates).toContainText('Louis táctil')
  await editor.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toHaveValue('480')
  await original.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toHaveValue('400')
  expect((await readApi<{ data: unknown[] }>(page, 'studio/pos/templates')).data).toHaveLength(2)
  expect((await readApi<{ data: unknown }>(page, 'studio/pos')).data).toBeNull()
  expect(
    (await readApi<{ data: { revision: number } }>(page, 'studio/pos/active')).data.revision,
  ).toBe(0)
})
