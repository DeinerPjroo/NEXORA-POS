import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'
import type { Sale } from '../src/features/sales/types'
import { readApi, registerWorkspace, writeApi } from './helpers'

test('dividir cuenta: centavos exactos, pagos por parte, devolución y cierre sin duplicar venta', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await registerWorkspace(page, 'Oliva Cuentas', 'split')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Menú',
    color: '#8271FF',
    is_active: true,
  })
  const product = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    name: 'Menú para compartir',
    sku: 'MENU-SPLIT',
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
  await writeApi(page, 'POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    name: 'Transferencia por cuenta',
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
  await page.goto(`/pedidos/${order.data.id}/cobrar`)
  await page.getByLabel('Dividir cuenta', { exact: true }).selectOption('3')
  await expect(
    page
      .getByLabel('Cuenta del primer pago', { exact: true })
      .getByRole('option', { name: /Cuenta 3.*33,33/ }),
  ).toHaveCount(1)
  await page.getByLabel('Cuenta del primer pago', { exact: true }).selectOption('2')
  await expect(page.getByLabel('Importe de este pago', { exact: true })).toHaveValue('33.34')
  await page.getByLabel('Importe de este pago', { exact: true }).fill('33.35')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('40')
  await expect(
    page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Importe de este pago', { exact: true }).fill('10')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20')
  let lost = false
  await page.route('**/api/v1/orders/*/collect', async (route) => {
    const response = await route.fetch()
    if (!lost) {
      lost = true
      await route.abort('failed')
    } else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar cobro', exact: true })).toBeVisible()
  await expect(page.getByLabel('Dividir cuenta', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar cobro', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const saleId = Number(page.url().split('/').at(-1))
  const first = await readApi<{ data: Sale }>(page, `sales/${saleId}`)
  expect(first.data.accounts).toHaveLength(3)
  expect(first.data.accounts.map((part) => part.amount)).toEqual(['33.3400', '33.3400', '33.3300'])
  expect(first.data.payments).toHaveLength(1)
  await expect(
    page
      .getByRole('region', { name: 'Cuenta 2', exact: true })
      .getByText(formatMoney('23.34'), { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Agregar pagos', exact: true }).click()
  await page
    .getByLabel('Cuenta de este pago', { exact: true })
    .selectOption(String(first.data.accounts[1].id))
  await expect(page.getByLabel('Importe a agregar', { exact: true })).toHaveValue('23.34')
  await page.getByLabel('Importe a agregar', { exact: true }).fill('23.35')
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('30')
  await expect(
    page.getByRole('button', { name: 'Agregar pago al lote', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Importe a agregar', { exact: true }).fill('5')
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Método: Efectivo', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un método de pago', exact: true })
    .getByRole('button', { name: /Transferencia por cuenta/ })
    .click()
  await expect(page.getByLabel('Importe a agregar', { exact: true })).toHaveValue('18.34')
  await page.getByLabel('Referencia del pago a agregar', { exact: true }).fill('CUENTA-2')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar lote de pagos', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page
      .getByRole('region', { name: 'Cuenta 2', exact: true })
      .getByText(formatMoney('0'), { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Devolución parcial', exact: true }).click()
  await page.getByLabel('Importe a devolver del pago', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Agregar devolución al lote', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución parcial', { exact: true })
    .fill('Devolver parte del pago de cuenta dos')
  await page.getByRole('button', { name: 'Confirmar devolución parcial', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Agregar pagos', exact: true }).click()
  await expect(
    page
      .getByLabel('Cuenta de este pago', { exact: true })
      .getByRole('option', { name: /Cuenta 2/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Método: Efectivo', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un método de pago', exact: true })
    .getByRole('button', { name: /Transferencia por cuenta/ })
    .click()
  await expect(page.getByLabel('Importe a agregar', { exact: true })).toHaveValue('33.34')
  await page.getByLabel('Referencia del pago a agregar', { exact: true }).fill('CUENTA-1')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await expect(page.getByLabel('Importe a agregar', { exact: true })).toHaveValue('33.33')
  await page.getByLabel('Referencia del pago a agregar', { exact: true }).fill('CUENTA-3')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar lote de pagos', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agregar pagos', exact: true })).toHaveCount(0)
  const settled = await readApi<{ data: Sale }>(page, `sales/${saleId}`)
  expect(settled.data.balance_due).toBe('0.0000')
  expect(settled.data.accounts.every((part) => part.balance_due === '0.0000')).toBe(true)
  expect(settled.data.accounts[1].net_paid_amount).toBe('28.3400')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: '../docs/screenshots/split-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Cerrar venta y sus tres cuentas')
  const references = page.getByRole('dialog').locator('input[name^="refund_reference_"]')
  await expect(references).toHaveCount(3)
  for (let index = 0; index < 3; index++)
    await references.nth(index).fill(`CUENTA-DEV-${index + 1}`)
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
  const closed = await readApi<{ data: Sale }>(page, `sales/${saleId}`)
  expect(closed.data.accounts.every((part) => part.effective_total === '0.0000')).toBe(true)
  expect(closed.data.refunded_amount).toBe('100.0100')
  await page.goto(`/caja/sesiones/${session.data.id}`)
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
