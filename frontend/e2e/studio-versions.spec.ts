import { test, expect, type Locator } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { PosLayout } from '../src/features/studio/pos-layout'

async function range(control: Locator, value: number) {
  await control.evaluate((node, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      node,
      String(next),
    )
    node.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}
test('Studio C: undo por gesto, comparación, restauración incierta y archivo conservan la publicación', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await fixtureWorkspace(page, 'Studio versiones')
  const defaults = (await readApi<{ defaults: PosLayout }>(page, 'studio/pos')).defaults
  await writeApi(page, 'POST', 'studio/pos/draft', {
    idempotency_key: crypto.randomUUID(),
    revision: 0,
    configuration: defaults,
  })
  await writeApi(page, 'POST', 'studio/pos/publish', {
    idempotency_key: crypto.randomUUID(),
    revision: 1,
  })
  await page.goto('/admin/studio/pos')
  const editor = page.getByRole('region', { name: 'Editor de Terminal POS', exact: true })
  const width = editor.getByLabel('Ancho del pedido', { exact: true })
  const undo = editor.getByRole('button', { name: 'Deshacer', exact: true })
  const redo = editor.getByRole('button', { name: 'Rehacer', exact: true })
  await expect(width).toHaveValue('480')
  await range(width, 420)
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(width).toHaveValue('480')
  await redo.click()
  await expect(width).toHaveValue('420')
  const grip = page.getByRole('button', { name: 'Redimensionar panel del pedido', exact: true })
  const box = (await grip.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  const resized = await width.inputValue()
  expect(Number(resized)).toBeGreaterThan(420)
  await undo.click()
  await expect(width).toHaveValue('420')
  await redo.click()
  await expect(width).toHaveValue(resized)
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByText(/Borrador · revisión 3/)).toBeVisible()
  await editor.getByRole('button', { name: 'Ver diseño publicado', exact: true }).click()
  await expect(width).toHaveValue('480')
  await expect(width).toBeDisabled()
  await editor.getByRole('button', { name: 'Editar borrador', exact: true }).click()
  await expect(width).toHaveValue(resized)
  await editor.locator('.studio-comparison > summary').click()
  await expect(editor.locator('.studio-comparison')).toContainText('Ancho del pedido')
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor.getByText(/Publicado 4/)).toBeVisible()
  await expect(undo).toBeDisabled()
  const history = page.getByRole('region', { name: 'Historial de diseños', exact: true })
  await history.getByRole('button', { name: 'Restaurar versión 1', exact: true }).click()
  const restore = page.getByRole('dialog', { name: 'Restaurar diseño como borrador', exact: true })
  await restore.getByLabel('Motivo', { exact: true }).fill('Volver a distribución original')
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/studio/pos/restore'))
      bodies.push(request.postDataJSON())
  })
  await page.route(
    '**/api/v1/studio/pos/restore',
    async (route) => {
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await restore.getByRole('button', { name: 'Confirmar restauración', exact: true }).click()
  await expect(
    restore.getByRole('button', { name: 'Reintentar mismo cambio', exact: true }),
  ).toBeVisible()
  await expect(restore.getByLabel('Motivo', { exact: true })).toBeDisabled()
  await expect(restore.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled()
  await restore.getByRole('button', { name: 'Reintentar mismo cambio', exact: true }).click()
  await expect(restore).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  await expect(width).toHaveValue('480')
  expect(
    (await readApi<{ data: { configuration: PosLayout } }>(page, 'studio/pos/active')).data
      .configuration.tokens.order_width,
  ).toBe(Number(resized))
  await expect(
    history.getByRole('button', { name: 'Archivar versión 4', exact: true }),
  ).toBeDisabled()
  await expect(
    history.getByRole('button', { name: 'Archivar versión 5', exact: true }),
  ).toBeDisabled()
  await history.getByRole('button', { name: 'Archivar versión 2', exact: true }).click()
  const archive = page.getByRole('dialog', { name: 'Archivar versión de diseño', exact: true })
  await archive.getByLabel('Motivo', { exact: true }).fill('Conservar como referencia histórica')
  await archive.getByRole('button', { name: 'Confirmar archivo', exact: true }).click()
  await expect(archive).toHaveCount(0)
  await expect(
    history.getByRole('button', { name: 'Restaurar versión 2', exact: true }),
  ).toHaveCount(0)
  await history.getByRole('checkbox', { name: 'Incluir archivadas', exact: true }).check()
  await expect(history.getByRole('cell', { name: /^Archivada/ })).toBeVisible()
  await history.screenshot({ path: 'test-results/studio-version-history.png' })
  await history.getByRole('button', { name: 'Previsualizar versión 2', exact: true }).click()
  await expect(editor.getByText(/Vista previa de versión 2/)).toBeVisible()
  await expect(width).toBeDisabled()
  await editor.getByRole('button', { name: 'Editar borrador', exact: true }).click()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor.getByText(/Publicado 7/)).toBeVisible()
  const versions = await readApi<{ meta: { total: number } }>(
    page,
    'studio/pos/versions?archived=1',
  )
  expect(versions.meta.total).toBe(6)
  await history.getByRole('button', { name: 'Restaurar versión 1', exact: true }).click()
  await restore.getByLabel('Motivo', { exact: true }).fill('Intento sobre una revisión anterior')
  const concurrent = structuredClone(defaults)
  concurrent.tokens.order_width = 350
  await writeApi(page, 'POST', 'studio/pos/draft', {
    idempotency_key: crypto.randomUUID(),
    revision: 7,
    configuration: concurrent,
  })
  await restore.getByRole('button', { name: 'Confirmar restauración', exact: true }).click()
  await restore.getByRole('button', { name: 'Cerrar y recargar diseño', exact: true }).click()
  await expect(restore).toHaveCount(0)
  await expect(width).toHaveValue('350')
  await page.reload()
  await expect(width).toHaveValue('350')
  expect(
    (await readApi<{ data: { configuration: PosLayout } }>(page, 'studio/pos/active')).data
      .configuration.tokens.order_width,
  ).toBe(480)
  expect((await readApi<{ meta: { total: number } }>(page, 'orders')).meta.total).toBe(0)
})
