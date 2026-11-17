import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'
import type { Sale } from '../src/features/sales/types'
import { readApi, registerWorkspace, writeApi } from './helpers'

test('devoluciones parciales conservan deuda, recuperan respuesta y devuelven solo el remanente', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await registerWorkspace(page, 'Oliva Devoluciones', 'partial-refunds')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Menú',
    color: '#8271FF',
    is_active: true,
  })
  const product = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Menú parcial',
    sku: 'MENU-REFUND',
    category_id: category.id,
    sale_price: '100.01',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Impuesto',
    tax_rate: '0',
  })
  const transfer = await writeApi<{ data: { id: number } }>(page, 'POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    name: 'Transferencia de devolución',
    code: 'transfer',
    kind: 'non_cash',
    is_active: true,
  })
  const registers = await readApi<{ data: { id: number; branch_id: number }[] }>(
    page,
    'cash/registers',
  )
  const register = registers.data[0]
  const session = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${register.id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  const order = await writeApi<{ data: { id: number } }>(page, 'POST', 'orders', {
    idempotency_key: crypto.randomUUID(),
    branch_id: register.branch_id,
    channel: 'takeaway',
    currency: 'COP',
    items: [
      {
        product_id: product.data.id,
        quantity: 1,
        product_revision: 1,
        expected_unit_price: '100.01',
      },
    ],
  })
  const response = await writeApi<{ data: Sale }>(page, 'POST', `orders/${order.data.id}/collect`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: session.data.id,
    cash_revision: 1,
    order_revision: 1,
    settings_revision: 2,
    discount_amount: '0',
    expected_total: '100.01',
    payment_amount: '40',
    received_amount: '50',
  })
  const sale = response.data
  await page.goto(`/ventas/${sale.id}`)
  await page.getByRole('button', { name: 'Devolución parcial', exact: true }).click()
  await page.getByLabel('Importe a devolver del pago', { exact: true }).fill('40.01')
  await expect(
    page.getByRole('button', { name: 'Agregar devolución al lote', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Importe a devolver del pago', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Agregar devolución al lote', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución parcial', { exact: true })
    .fill('Ajuste parcial solicitado por cliente')
  let lost = false
  await page.route('**/api/v1/sales/*/refunds', async (route) => {
    const result = await route.fetch()
    if (!lost) {
      lost = true
      await route.abort('failed')
    } else await route.fulfill({ response: result })
  })
  await page.getByRole('button', { name: 'Confirmar devolución parcial', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar devolución parcial', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Caja de la devolución parcial', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar devolución parcial', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devoluciones parciales registradas', exact: true }),
  ).toBeVisible()
  const after = await readApi<{ data: Sale }>(page, `sales/${sale.id}`)
  expect(after.data.refunds).toHaveLength(1)
  expect(after.data.balance_due).toBe('60.0100')
  expect(after.data.net_paid_amount).toBe('30.0000')
  await page.getByRole('button', { name: 'Devolución parcial', exact: true }).click()
  await page.getByLabel('Importe a devolver del pago', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Agregar devolución al lote', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución parcial', { exact: true })
    .fill('Segundo ajuste del mismo pago')
  await page.getByRole('button', { name: 'Confirmar devolución parcial', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Agregar pagos', exact: true }).click()
  await page.getByRole('button', { name: 'Método: Efectivo', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un método de pago', exact: true })
    .getByRole('button', { name: /Transferencia de devolución/ })
    .click()
  await page.getByLabel('Referencia del pago a agregar', { exact: true }).fill('SALDO-60.01')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar lote de pagos', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agregar pagos', exact: true })).toHaveCount(0)
  const paid = await readApi<{ data: Sale }>(page, `sales/${sale.id}`)
  const bankPayment = paid.data.payments.find((p) => p.payment_method_id === transfer.data.id)
  await page.getByRole('button', { name: 'Devolución parcial', exact: true }).click()
  await page
    .getByLabel('Pago original a devolver', { exact: true })
    .selectOption(String(bankPayment!.id))
  await page.getByLabel('Importe a devolver del pago', { exact: true }).fill('20.01')
  await expect(
    page.getByRole('button', { name: 'Agregar devolución al lote', exact: true }),
  ).toBeDisabled()
  await page
    .getByLabel('Referencia de la devolución parcial', { exact: true })
    .fill('BANCO-DEV-20.01')
  await page.getByRole('button', { name: 'Agregar devolución al lote', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución parcial', { exact: true })
    .fill('Devolución manual de transferencia')
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/partial-refund-modal.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Confirmar devolución parcial', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: '../docs/screenshots/partial-refund-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await expect(page.getByRole('dialog').getByText(formatMoney('65'), { exact: true })).toBeVisible()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Devolver únicamente el remanente')
  await page.getByLabel('Referencia de la devolución', { exact: true }).fill('BANCO-DEV-RESTO')
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
  const closed = await readApi<{ data: Sale }>(page, `sales/${sale.id}`)
  expect(closed.data.refunds).toHaveLength(5)
  expect(closed.data.refunded_amount).toBe('100.0100')
  await page.goto(`/caja/sesiones/${session.data.id}`)
  await expect(page.getByRole('heading', { name: 'El recorrido de tu efectivo' })).toBeVisible()
  await expect(
    page
      .locator('section.panel')
      .filter({ has: page.getByText('Efectivo esperado', { exact: true }) })
      .getByText(formatMoney('1000'), { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await page.getByLabel('Efectivo contado al cierre').fill('1000')
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(
    page.getByText('Cierre registrado. Los movimientos se conservan.', { exact: true }),
  ).toBeVisible()
})
