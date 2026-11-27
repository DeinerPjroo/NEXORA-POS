import { test, expect, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Sale } from '../src/features/sales/types'
import { formatMoney } from '../src/lib/money'

async function publish(editor: Locator, revision: number) {
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  const [response] = await Promise.all([
    editor
      .page()
      .waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/publish'),
      ),
    editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click(),
  ])
  expect(response.ok()).toBe(true)
  await expect(editor).toContainText(`Publicado ${revision}`)
}

test('Studio documentos: datos reales, transferencia segura, formato congelado y bloqueo de impresión', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('ResizeObserver'))
      errors.push(message.text())
  })
  context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error.message)))
  const { password } = await fixtureWorkspace(page, 'Studio impresión')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza documento real',
      sku: 'STUDIO-PRINT',
      category_id: category.id,
      sale_price: '100.01',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const station = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'kitchen-stations', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Pizzas impresión',
      color: '#7255db',
      target_minutes: 12,
      is_active: true,
    })
  ).data
  await writeApi(page, 'POST', 'kitchen-routes', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    product_id: product.id,
    product_revision: 1,
    kitchen_station_id: station.id,
    is_active: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  const cash = (
    await writeApi<{ data: { id: number; revision: number } }>(
      page,
      'POST',
      `cash/registers/${register.id}/open`,
      { idempotency_key: crypto.randomUUID(), opening_amount: '0', currency: 'COP' },
    )
  ).data
  const order = (
    await writeApi<{ data: { id: number; revision: number } }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'takeaway',
      currency: 'COP',
      items: [
        {
          product_id: product.id,
          product_revision: 2,
          quantity: 1,
          expected_unit_price: '100.01',
          notes: 'Sin cebolla',
          preparation_destination: 'takeaway',
        },
      ],
    })
  ).data
  await writeApi(page, 'POST', `orders/${order.id}/kitchen-dispatch`, {
    idempotency_key: crypto.randomUUID(),
    order_revision: order.revision,
  })
  const fresh = (await readApi<{ data: { revision: number } }>(page, `orders/${order.id}`)).data
  const sale = (
    await writeApi<{ data: Sale }>(page, 'POST', `orders/${order.id}/collect`, {
      idempotency_key: crypto.randomUUID(),
      cash_session_id: cash.id,
      cash_revision: cash.revision,
      order_revision: fresh.revision,
      settings_revision: 2,
      discount_amount: '0',
      expected_total: '100.01',
      received_amount: '100.01',
    })
  ).data
  const cashBefore = (
    await readApi<{ data: { revision: number; expected_amount: string } }>(
      page,
      `cash/sessions/${cash.id}`,
    )
  ).data
  const tickets = (
    await readApi<{ data: { id: number }[] }>(page, `orders/${order.id}/kitchen-tickets`)
  ).data
  await page.goto('/admin/studio/recibos')
  const editor = page.getByRole('region', { name: 'Editor de Recibos' })
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('.thermal-sale-receipt')).toContainText(sale.receipt_code)
  await editor.getByRole('button', { name: 'Térmico compacto 58 mm', exact: true }).click()
  await editor.getByLabel('Pie de texto adicional').fill('<b>Gracias Louis Pizza</b>')
  await expect(preview.locator('.studio-print-footer')).toHaveText('<b>Gracias Louis Pizza</b>')
  await expect(preview.locator('.studio-print-footer b')).toHaveCount(0)
  await expect(preview.locator('.thermal-sale-receipt')).toContainText('No es factura electrónica')
  await publish(editor, 2)
  const downloadPromise = page.waitForEvent('download')
  await editor.getByRole('button', { name: 'Exportar borrador guardado', exact: true }).click()
  const download = await downloadPromise
  const envelope = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(Object.keys(envelope).sort()).toEqual(['configuration', 'format', 'surface', 'version'])
  envelope.configuration.tokens.font_size = 14
  envelope.configuration.texts.footer = 'Importado con seguridad'
  await editor.getByLabel('Importar diseño JSON', { exact: true }).setInputFiles({
    name: 'recibo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  })
  const importing = page.getByRole('dialog', { name: 'Importar diseño como borrador', exact: true })
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/studio/receipt/import'))
      bodies.push(request.postDataJSON())
  })
  await page.route(
    '**/api/v1/studio/receipt/import',
    async (route) => {
      await route.fetch()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await importing.getByRole('button', { name: 'Validar e importar borrador', exact: true }).click()
  await expect(
    importing.getByRole('button', { name: 'Reintentar misma importación', exact: true }),
  ).toBeVisible()
  await expect(importing.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled()
  await importing.getByRole('button', { name: 'Reintentar misma importación', exact: true }).click()
  await expect(importing).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  expect(
    (
      await readApi<{ data: { configuration: { tokens: { font_size: number } } } }>(
        page,
        'studio/receipt/active',
      )
    ).data.configuration.tokens.font_size,
  ).toBe(11)
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 4')
  const runtime = await context.newPage()
  await runtime.goto(`/ventas/${sale.id}`)
  await runtime.getByRole('button', { name: 'Imprimir recibo', exact: true }).click()
  const modal = runtime.getByRole('dialog', {
    name: `Imprimir recibo ${sale.receipt_code}`,
    exact: true,
  })
  await expect(modal.getByLabel('Ancho de papel', { exact: true })).toHaveValue('58')
  await expect(modal.locator('.operational-ticket')).toHaveCSS('font-size', '14px')
  await expect(modal).toContainText(formatMoney('100.01'))
  await editor.getByRole('button', { name: 'Original', exact: true }).click()
  await editor.getByLabel('Pie de texto adicional').fill('Segunda publicación')
  await publish(editor, 6)
  await expect(modal.getByLabel('Ancho de papel', { exact: true })).toHaveValue('58')
  await expect(modal.locator('.studio-print-footer')).toHaveText('Importado con seguridad')
  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await runtime.getByRole('button', { name: 'Imprimir recibo', exact: true }).click()
  await expect(modal.getByLabel('Ancho de papel', { exact: true })).toHaveValue('80')
  await expect(modal.locator('.studio-print-footer')).toHaveText('Segunda publicación')
  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.goto('/admin/studio/comandas')
  const kitchenEditor = page.getByRole('region', { name: 'Editor de Comandas' })
  await expect(preview.locator('.operational-ticket')).toContainText('Sin cebolla')
  await expect(preview.locator('.operational-ticket')).toContainText('EMPACAR')
  await kitchenEditor.getByRole('button', { name: 'Térmico compacto 58 mm', exact: true }).click()
  await publish(kitchenEditor, 2)
  await runtime.goto('/terminal/cocina')
  await runtime
    .getByRole('button', { name: `Imprimir comanda #${tickets[0].id}`, exact: true })
    .click()
  const comanda = runtime.getByRole('dialog', { name: 'Imprimir comanda', exact: true })
  await expect(comanda.getByLabel('Ancho de papel', { exact: true })).toHaveValue('58')
  await expect(comanda).toContainText('NO ES FACTURA NI COMPROBANTE DE PAGO')
  const saleAfter = (await readApi<{ data: Sale }>(runtime, `sales/${sale.id}`)).data
  expect(saleAfter.total).toBe(sale.total)
  expect(saleAfter.revision).toBe(sale.revision)
  expect(saleAfter.payments).toEqual(sale.payments)
  const cashAfter = (
    await readApi<{ data: { revision: number; expected_amount: string } }>(
      runtime,
      `cash/sessions/${cash.id}`,
    )
  ).data
  expect(cashAfter.revision).toBe(cashBefore.revision)
  expect(cashAfter.expected_amount).toBe(cashBefore.expected_amount)
  expect(
    (await readApi<{ data: unknown[] }>(runtime, `orders/${order.id}/kitchen-tickets`)).data,
  ).toHaveLength(1)
  await writeApi(runtime, 'POST', 'auth/screen/lock', {})
  await runtime.evaluate(() => window.dispatchEvent(new Event('nexora:screen-changed')))
  const lock = runtime.getByRole('dialog', { name: 'Pantalla bloqueada', exact: true })
  await expect(lock).toBeVisible()
  await expect(runtime.locator('.operational-print-root')).toHaveCount(0)
  await lock.getByLabel('Tu contraseña', { exact: true }).fill(password)
  await lock.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(lock).toBeHidden()
  await expect(comanda).toContainText('Sin cebolla')
  expect(errors).toEqual([])
})
