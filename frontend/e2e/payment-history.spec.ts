import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'
import type { Sale } from '../src/features/sales/types'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('historial: paginar, filtrar referencias literales y actualizar netos tras devolver', async ({
  page,
}) => {
  test.setTimeout(240_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Historial')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Menú',
    color: '#8271FF',
    is_active: true,
  })
  const product = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Menú de historial',
    sku: 'HIST-1',
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
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const bank = await writeApi<{ data: { id: number } }>(page, 'POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    name: 'Transferencia histórica',
    code: 'bank',
    kind: 'non_cash',
    is_active: true,
  })
  const registers = await readApi<{ data: { id: number; branch_id: number }[] }>(
    page,
    'cash/registers',
  )
  const session = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${registers.data[0].id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  const order = await writeApi<{ data: { id: number } }>(page, 'POST', 'orders', {
    idempotency_key: crypto.randomUUID(),
    branch_id: registers.data[0].branch_id,
    channel: 'takeaway',
    currency: 'COP',
    items: [
      {
        product_id: product.data.id,
        product_revision: 1,
        quantity: 1,
        expected_unit_price: '100.01',
      },
    ],
  })
  const first = await writeApi<{ data: Sale }>(page, 'POST', `orders/${order.data.id}/collect`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: session.data.id,
    cash_revision: 1,
    order_revision: 1,
    settings_revision: 2,
    discount_amount: '0',
    payment_amount: '40',
    expected_total: '100.01',
    received_amount: '50',
  })
  const paid = await writeApi<{ data: Sale }>(page, 'POST', `sales/${first.data.id}/payments`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: session.data.id,
    cash_revision: 2,
    sale_revision: 2,
    expected_balance: '60.01',
    payments: Array.from({ length: 13 }, (_, index) => ({
      payment_method_id: bank.data.id,
      method_revision: 1,
      amount: index === 12 ? '0.01' : '5',
      received_amount: index === 12 ? '0.01' : '5',
      reference: index === 0 ? 'REF%_!LITERAL' : `BANK-${index}`,
    })),
  })
  await writeApi(page, 'POST', `sales/${paid.data.id}/refunds`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: session.data.id,
    cash_revision: 15,
    sale_revision: 3,
    expected_refundable: '100.01',
    reason: 'Devolución parcial antes de consultar historial',
    refunds: [
      { payment_id: paid.data.payments[0].id, amount: '10' },
      { payment_id: paid.data.payments[1].id, amount: '1', reference: 'DEV-HIST-1' },
    ],
  })
  await writeApi(page, 'PUT', `payment-methods/${bank.data.id}`, {
    revision: 1,
    name: 'Transferencia archivada',
    is_active: false,
  })
  await page.goto('/ventas')
  await page.getByRole('link', { name: 'Historial de pagos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Historial de pagos', exact: true })).toBeVisible()
  const rows = page
    .getByRole('region', { name: 'Pagos registrados', exact: true })
    .locator('tbody tr')
  const summary = page.getByRole('region', { name: 'Resumen de esta página', exact: true })
  await expect(rows).toHaveCount(12)
  await expect(summary.getByText(formatMoney('55.01'), { exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(summary.getByText(formatMoney('34'), { exact: true })).toBeVisible()
  await page.getByLabel('Tipo de método', { exact: true }).selectOption('non_cash')
  await page.getByLabel('Buscar referencia del pago', { exact: true }).fill('%_!')
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.getByText('Transferencia histórica', { exact: true })).toBeVisible()
  await expect(rows.getByText('REF%_!LITERAL', { exact: true })).toBeVisible()
  await expect(summary.getByText(formatMoney('4'), { exact: true })).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/payment-history-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await expect(rows).toHaveCount(12)
  await page.getByLabel('Desde la fecha', { exact: true }).fill('2099-01-01')
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(page.getByText('No hay pagos con estos filtros.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await expect(rows).toHaveCount(12)
  await rows.first().getByRole('link', { name: 'Ver recibo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Cerrar pagos conservando historial')
  const references = page.getByRole('dialog').locator('input[name^="refund_reference_"]')
  await expect(references).toHaveCount(13)
  for (let index = 0; index < 13; index++) await references.nth(index).fill(`HIST-DEV-${index + 1}`)
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
  await page.goto('/ventas/historial')
  await expect(summary.getByText(formatMoney('0'), { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: '../docs/screenshots/payment-history-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})
