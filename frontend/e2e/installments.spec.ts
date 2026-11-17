import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'

test('abono y pago mixto: recuperar lote, devolver cobros reales y cerrar caja', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto('/registro')
  await page.getByLabel('Nombre del restaurante', { exact: true }).fill('Oliva Abonos')
  await page.getByLabel('Tu nombre', { exact: true }).fill('Ana Pérez')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`installments-${Date.now()}@example.test`)
  await page.getByLabel('Contraseña', { exact: true }).fill('SeguraNexora123')
  await page.getByLabel('Confirma tu contraseña').fill('SeguraNexora123')
  await page.getByRole('button', { name: 'Crear mi espacio de trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  async function setup(method: 'POST' | 'PUT', path: string, body: unknown) {
    await page.request.get('/sanctum/csrf-cookie')
    const cookie = (await page.context().cookies()).find((item) => item.name === 'XSRF-TOKEN')!
    const response = await page.request.fetch(`/api/v1/${path}`, {
      method,
      data: body,
      headers: {
        Origin: 'http://127.0.0.1:5199',
        Accept: 'application/json',
        'X-XSRF-TOKEN': decodeURIComponent(cookie.value),
      },
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const category = await setup('POST', 'categories', {
    name: 'Especiales',
    color: '#8271FF',
    is_active: true,
  })
  await setup('POST', 'products', {
    name: 'Menú de abonos',
    sku: 'MENU-ABONO',
    category_id: category.id,
    sale_price: '100.01',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await setup('PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Impuesto adicional',
    tax_rate: '0',
  })
  await setup('POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    name: 'Transferencia de prueba',
    code: 'transfer',
    kind: 'non_cash',
    is_active: true,
  })
  await page.getByRole('navigation').getByRole('link', { name: 'Caja', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await page.getByLabel('Base inicial de caja').fill('1000')
  await page.getByRole('button', { name: 'Confirmar apertura', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'El recorrido de tu efectivo' })).toBeVisible()
  const cashUrl = page.url()
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Agregar Menú de abonos', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await page.getByLabel('Importe de este pago', { exact: true }).fill('40')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('50')
  await expect(
    page.locator('.checkout-change').getByText(formatMoney('10'), { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article').getByText('Abonada', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('article').getByText(formatMoney('60.01'), { exact: true }),
  ).toBeVisible()
  const saleUrl = page.url()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/installment-receipt.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Agregar pagos', exact: true }).click()
  await page.getByLabel('Importe a agregar', { exact: true }).fill('10')
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Método: Efectivo', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un método de pago', exact: true })
    .getByRole('button', { name: /Transferencia de prueba/ })
    .click()
  await page.getByLabel('Referencia del pago a agregar', { exact: true }).fill('ABONO-REF-001')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await expect(page.locator('.payment-draft-line')).toHaveCount(2)
  await page.screenshot({
    path: '../docs/screenshots/mixed-payment.png',
    fullPage: true,
    animations: 'disabled',
  })
  let lost = false
  await page.route('**/api/v1/sales/*/payments', async (route) => {
    const response = await route.fetch()
    if (!lost) {
      lost = true
      await route.abort('failed')
    } else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Confirmar lote de pagos', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar lote de pagos', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Caja de la operación', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar lote de pagos', exact: true }).click()
  await expect(page.getByRole('article').getByText('Cobrada', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar pagos', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Pago manual no efectivo', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/mixed-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto(cashUrl)
  await expect(page.getByText(formatMoney('1050'), { exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /Cobro recibo V-000001/ })).toHaveCount(2)
  await page.goto(saleUrl)
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Devolución completa de abonos mixtos')
  await page.getByLabel('Referencia de la devolución', { exact: true }).fill('ABONO-DEV-001')
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('article').getByText('Devuelta', { exact: true })).toBeVisible()
  await page.goto(cashUrl)
  await expect(page.getByRole('row', { name: /Devolución recibo V-000001/ })).toHaveCount(2)
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await page.getByLabel('Efectivo contado al cierre').fill('1000')
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(
    page.getByText('Cierre registrado. Los movimientos se conservan.', { exact: true }),
  ).toBeVisible()
})
