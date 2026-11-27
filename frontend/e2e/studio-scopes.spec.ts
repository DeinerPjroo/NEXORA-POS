import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi } from './helpers'

test('Studio D: plantillas reversibles y borradores separados por dispositivo', async ({
  page,
}) => {
  await fixtureWorkspace(page, 'Studio asignaciones')
  await page.goto('/admin/studio/pos')
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS' })
  await editor.getByRole('button', { name: /^Compacta/ }).click()
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toHaveValue('400')
  await expect(page.getByLabel('Dispositivo', { exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toHaveValue('480')
  await page.getByLabel('Dispositivo', { exact: true }).selectOption('tablet')
  await editor.getByRole('button', { name: /^Compacta/ }).click()
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(page.getByLabel('Dispositivo', { exact: true })).toBeEnabled()
  const tablet = await readApi<{
    data: { draft: { tokens: { product_columns: number; order_width: number } } }
  }>(page, 'studio/pos?device=tablet')
  expect(tablet.data.draft.tokens).toMatchObject({ product_columns: 2, order_width: 400 })
  expect((await readApi<{ data: unknown }>(page, 'studio/pos')).data).toBeNull()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 2')
  expect(
    (
      await readApi<{ data: { configuration: { tokens: { order_width: number } } } }>(
        page,
        'studio/pos/active?device=tablet',
      )
    ).data.configuration.tokens.order_width,
  ).toBe(400)
  await page.getByLabel('Dispositivo', { exact: true }).selectOption('desktop')
  await expect(editor.getByLabel('Ancho del pedido', { exact: true })).toHaveValue('480')
  expect(
    (await readApi<{ data: { revision: number } }>(page, 'studio/pos/active?device=desktop')).data
      .revision,
  ).toBe(0)
})
