import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Sale } from '../src/features/sales/types'

test('Recibo térmico desde el cobro y el historial conserva impuestos, cambio, abonos y devoluciones', async ({
  page,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Recibos restaurante')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7258df',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza recibo',
      sku: 'SALE-PRINT',
      category_id: category.id,
      sale_price: '18000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'exclusive',
    tax_name: 'Tasa ficticia',
    tax_rate: '8',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', `cash/registers/${register.id}/open`, {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '0',
      currency: 'COP',
    })
  ).data
  await page.goto('/terminal/recogidas')
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  const client = page.getByRole('group', { name: 'Datos del cliente y pedido', exact: true })
  await client.getByLabel('Nombre del cliente', { exact: true }).fill('Ana Recibo')
  await client.getByLabel('Referencia del pedido', { exact: true }).fill('Recoger Ana')
  await client.getByRole('button', { name: 'Listo · volver al pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza recibo', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20000')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/terminal\/recogidas$/)
  await page.getByRole('button', { name: 'Imprimir recibo', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Imprimir recibo V-000001', exact: true })
  const ticket = preview.locator('.thermal-sale-receipt')
  await expect(ticket).toContainText('Ana Recibo')
  await expect(ticket).toContainText('Pizza recibo')
  await expect(ticket).toContainText('19.440')
  await expect(ticket).toContainText('1.440')
  await expect(ticket).toContainText('560')
  await expect(ticket).toContainText('Documento interno. No es factura electrónica.')
  await page.screenshot({ path: 'test-results/sale-print-preview.png' })
  await preview.getByLabel('Ancho de papel').selectOption('58')
  await expect(ticket).toHaveAttribute('data-width', '58')
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.receiptPrint = 'yes'
    }
  })
  await preview.getByRole('button', { name: 'Abrir impresión', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-receipt-print', 'yes')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#root')).toBeHidden()
  await expect(page.locator('#root')).toHaveCSS('display', 'none')
  await expect(page.locator('.receipt-sheet')).toBeHidden()
  await expect(page.locator('.operational-print-root')).toBeVisible()
  expect(
    (
      await page.pdf({
        path: 'test-results/sale-receipt-58.pdf',
        width: '58mm',
        printBackground: true,
      })
    ).length,
  ).toBeGreaterThan(1000)
  await page.screenshot({ path: 'test-results/sale-print-paper.png', fullPage: true })
  await page.emulateMedia({ media: 'screen' })
  await preview.getByRole('button', { name: 'Cerrar', exact: true }).click()
  const sales = (await readApi<{ data: Sale[] }>(page, 'sales')).data
  expect(sales).toHaveLength(1)
  expect(sales[0].paid_amount).toBe('19440.0000')
  const first = (await readApi<{ data: Sale }>(page, `sales/${sales[0].id}`)).data
  expect(first.payments).toHaveLength(1)
  const session = (
    await readApi<{ data: { revision: number; expected_amount: string } }>(
      page,
      `cash/sessions/${cash.id}`,
    )
  ).data
  expect(session.expected_amount).toBe('19440.0000')
  const order = (
    await writeApi<{ data: { id: number; revision: number } }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'takeaway',
      currency: 'COP',
      customer_name: 'Cliente abono',
      items: [
        { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '18000' },
      ],
    })
  ).data
  const partial = (
    await writeApi<{ data: Sale }>(page, 'POST', `orders/${order.id}/collect`, {
      idempotency_key: crypto.randomUUID(),
      cash_session_id: cash.id,
      cash_revision: session.revision,
      order_revision: order.revision,
      settings_revision: 2,
      discount_amount: '0',
      expected_total: '19440',
      payment_amount: '10000',
      received_amount: '10000',
    })
  ).data
  await page.goto(`/ventas/${partial.id}`)
  await page.getByRole('button', { name: 'Imprimir recibo', exact: true }).click()
  const partialPreview = page.getByRole('dialog', {
    name: `Imprimir recibo ${partial.receipt_code}`,
    exact: true,
  })
  await expect(partialPreview).toContainText('Abonada · SALDO PENDIENTE')
  await expect(partialPreview).toContainText('9.440')
  await partialPreview.getByRole('button', { name: 'Cerrar', exact: true }).click()
  const beforeRefund = (
    await readApi<{ data: { revision: number } }>(page, `cash/sessions/${cash.id}`)
  ).data
  await writeApi(page, 'POST', `sales/${first.id}/refund`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: cash.id,
    cash_revision: beforeRefund.revision,
    reason: 'Devolución de prueba para recibo',
  })
  await page.goto(`/ventas/${first.id}`)
  await page.getByRole('button', { name: 'Imprimir recibo', exact: true }).click()
  const returned = page.getByRole('dialog', { name: 'Imprimir recibo V-000001', exact: true })
  await expect(returned).toContainText('Devuelta')
  await expect(returned).toContainText('Devolución de prueba para recibo')
  expect((await readApi<{ data: Sale[] }>(page, 'sales')).data).toHaveLength(2)
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('10000.0000')
  await writeApi(page, 'POST', 'auth/screen/lock', {})
  await page.evaluate(() => window.dispatchEvent(new Event('nexora:screen-changed')))
  await expect(page.getByRole('dialog', { name: 'Pantalla bloqueada', exact: true })).toBeVisible()
  await expect(page.locator('.operational-print-root')).toHaveCount(0)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.receipt-sheet')).toHaveCSS('display', 'none')
  await page.emulateMedia({ media: 'screen' })
})
