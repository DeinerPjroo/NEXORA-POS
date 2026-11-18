import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Sale } from '../src/features/sales/types'
import type { PaymentReview } from '../src/features/sales/payment-history-types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('revisión manual: reintento exacto, conflicto tras devolución e historial móvil', async ({
  page,
}) => {
  test.setTimeout(240_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Conciliación')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Menú',
    color: '#8271FF',
    is_active: true,
  })
  const product = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Menú revisado',
    sku: 'REV-1',
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
  const method = await writeApi<{ data: { id: number } }>(page, 'POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    name: 'Transferencia manual',
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
  const sale = await writeApi<{ data: Sale }>(page, 'POST', `orders/${order.data.id}/collect`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: session.data.id,
    cash_revision: 1,
    order_revision: 1,
    settings_revision: 2,
    discount_amount: '0',
    expected_total: '100.01',
    received_amount: '100.01',
    payment_method_id: method.data.id,
    method_revision: 1,
    payment_reference: 'BANK-REV-1',
  })
  const payment = sale.data.payments[0]
  const reviewPath = `finance/payments/${payment.id}/reviews`
  await page.goto('/ventas/historial')
  const results = page.getByRole('region', { name: 'Pagos registrados', exact: true })
  await expect(results.getByText('Pendiente de revisión', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar revisión', exact: true }).click()
  await expect(page.getByLabel('Importe observado en el soporte', { exact: true })).toHaveValue('')
  await page.getByLabel('Importe observado en el soporte', { exact: true }).fill('100.01')
  await page.getByLabel('Referencia del soporte revisado', { exact: true }).fill('EXTRACTO-REV-1')
  const consent = page.getByLabel(
    'Confirmo que esta declaración corresponde a mi revisión manual.',
    { exact: true },
  )
  await expect(
    page.getByRole('button', { name: 'Guardar revisión manual', exact: true }),
  ).toBeDisabled()
  await consent.check()
  const bodies: string[] = []
  await page.route(`**/api/v1/${reviewPath}`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Guardar revisión manual', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar revisión', exact: true })).toBeVisible()
  await expect(page.getByLabel('Importe observado en el soporte', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar revisión', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  await page.unroute(`**/api/v1/${reviewPath}`)
  expect((await readApi<{ data: PaymentReview[] }>(page, reviewPath)).data).toHaveLength(1)
  await expect(results.getByText('Revisado manualmente', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar revisión', exact: true }).click()
  await page.getByLabel('Importe observado en el soporte', { exact: true }).fill('100.01')
  await page.getByLabel('Referencia del soporte revisado', { exact: true }).fill('SOPORTE-ANTERIOR')
  await consent.check()
  await writeApi(page, 'POST', `sales/${sale.data.id}/refunds`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: session.data.id,
    cash_revision: 2,
    sale_revision: 2,
    expected_refundable: '100.01',
    reason: 'Devolución mientras se revisa',
    refunds: [{ payment_id: payment.id, amount: '1', reference: 'DEV-REV-1' }],
  })
  await page.getByRole('button', { name: 'Guardar revisión manual', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('cambiaron')
  await page
    .getByRole('button', {
      name: 'Consultar datos actuales y descartar este formulario',
      exact: true,
    })
    .click()
  await expect(results.getByText('Requiere nueva revisión', { exact: true })).toBeVisible()
  await page.getByLabel('Estado de revisión manual', { exact: true }).selectOption('stale')
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Registrar revisión', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Registrar revisión', exact: true }).click()
  await page.getByLabel('Resultado de la revisión', { exact: true }).selectOption('difference')
  await page.getByLabel('Importe observado en el soporte', { exact: true }).fill('98.99')
  await page.getByLabel('Referencia del soporte revisado', { exact: true }).fill('EXTRACTO-REV-2')
  await page
    .getByLabel('Motivo de la diferencia o pendiente', { exact: true })
    .fill('Faltan dos centavos en el soporte revisado.')
  await expect(
    page.getByText(`Diferencia observada: ${formatMoney('-0.02')}`, { exact: true }),
  ).toBeVisible()
  await consent.check()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.getByRole('dialog').evaluate((dialog) => dialog.scrollTo(0, 0))
  await page.screenshot({
    path: '../docs/screenshots/payment-review-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Guardar revisión manual', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('No hay pagos con estos filtros.', { exact: true })).toBeVisible()
  await page.getByLabel('Estado de revisión manual', { exact: true }).selectOption('difference')
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(results.getByText('Diferencia declarada', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver revisiones', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Revisión 2 · Diferencia declarada', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Revisión 1 · Revisado manualmente', exact: true }),
  ).toBeVisible()
  const reviews = await readApi<{ data: PaymentReview[] }>(page, reviewPath)
  expect(reviews.data).toHaveLength(2)
  expect(reviews.data[0].difference_amount).toBe('-0.0200')
  const cash = await readApi<{ data: { expected_amount: string; revision: number } }>(
    page,
    `cash/sessions/${session.data.id}`,
  )
  expect(cash.data.expected_amount).toBe('1000.0000')
  expect(cash.data.revision).toBe(3)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/payment-reviews-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})
