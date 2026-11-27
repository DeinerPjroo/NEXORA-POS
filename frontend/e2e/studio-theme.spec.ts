import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi } from './helpers'

test('Studio: tema local claro y oscuro, herencia y publicación explícita', async ({ page }) => {
  await fixtureWorkspace(page, 'Temas Studio')
  await page.goto('/admin/studio/pos')
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS' })
  const preview = page.locator('.studio-pos-render .pos-terminal')
  const surface = () =>
    preview.evaluate((node) => getComputedStyle(node).getPropertyValue('--surface').trim())
  const theme = editor.getByLabel('Tema de la terminal', { exact: true })
  await theme.selectOption('dark')
  await expect(preview).toHaveAttribute('data-studio-theme', 'dark')
  expect(await surface()).toBe('#182030')
  expect(
    (await readApi<{ data: { revision: number } }>(page, 'studio/pos/active')).data.revision,
  ).toBe(0)
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await theme.selectOption('light')
  expect(await surface()).toBe('#fff')
  await theme.selectOption('inherit')
  expect(await surface()).toBe('#182030')
  await theme.selectOption('dark')
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 2')
  expect(
    (
      await readApi<{ data: { configuration: { options: { theme: string } } } }>(
        page,
        'studio/pos/active',
      )
    ).data.configuration.options.theme,
  ).toBe('dark')
})
