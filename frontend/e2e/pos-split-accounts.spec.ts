import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import { formatMoney } from '../src/lib/money'
import type { Sale } from '../src/features/sales/types'

test('POS: división táctil, centavos exactos y pago de la cuenta elegida sin duplicados', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'División táctil')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7258df',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Cuenta compartida',
    sku: 'SPLIT-POS',
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
    tax_name: 'Sin impuesto',
    tax_rate: '0',
    tip_enabled: false,
  })
  const { data: registers } = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  const { data: cash } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${registers[0].id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Cuenta compartida', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  const split = page.getByRole('region', { name: 'División de cuenta', exact: true })
  await split.getByRole('button', { name: /Dividir cuenta/ }).click()
  await split.getByRole('button', { name: 'Dividir en 3 cuentas', exact: true }).click()
  const part = (number: number) =>
    split.getByRole('button', { name: `Cobrar Cuenta ${number}`, exact: true })
  await expect(part(1)).toContainText(formatMoney('33.34'))
  await expect(part(2)).toContainText(formatMoney('33.34'))
  await expect(part(3)).toContainText(formatMoney('33.33'))
  await part(3).click()
  await expect(page.getByLabel('Importe de este pago', { exact: true })).toHaveValue('33.33')
  await page.getByRole('button', { name: 'Exacto', exact: true }).click()
  await expect(page.getByLabel('Efectivo recibido', { exact: true })).toHaveValue('33.33')
  await split.getByRole('button', { name: 'Añadir una cuenta', exact: true }).click()
  await expect(split.getByLabel('Cantidad de cuentas')).toHaveText('4')
  await expect(page.getByLabel('Efectivo recibido', { exact: true })).toHaveValue('')
  await split.getByRole('button', { name: 'Quitar una cuenta', exact: true }).click()
  await expect(part(3)).toContainText(formatMoney('33.33'))
  await split.getByRole('button', { name: 'Sin dividir', exact: true }).click()
  await expect(part(1)).toHaveCount(0)
  await expect(page.getByLabel('Importe de este pago', { exact: true })).toHaveValue('100.01')
  await split.getByRole('button', { name: 'Dividir en 3 cuentas', exact: true }).click()
  await expect(part(2)).toContainText(formatMoney('33.34'))
  await part(2).click()
  await page.getByRole('button', { name: 'Exacto', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }),
  ).toBeEnabled()
  await page.locator('.pos-terminal').screenshot({ path: 'test-results/pos-split-accounts.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await split.scrollIntoViewIfNeeded()
  await expect(part(2)).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  const bodies: string[] = []
  await page.route('**/api/v1/orders/*/collect', async (route) => {
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar cobro', exact: true })).toBeVisible()
  await expect(
    split.getByRole('button', { name: 'Dividir en 3 cuentas', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Volver al pedido', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar cobro', exact: true }).click()
  await expect(page.getByRole('article', { name: /^Recibo / })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  expect(JSON.parse(bodies[0])).toMatchObject({
    split_count: 3,
    account_number: 2,
    payment_amount: '33.34',
  })
  const { data: sales } = await readApi<{ data: Sale[] }>(page, 'sales')
  expect(sales).toHaveLength(1)
  const { data: sale } = await readApi<{ data: Sale }>(page, `sales/${sales[0].id}`)
  expect(sale.accounts.map((account) => account.amount)).toEqual(['33.3400', '33.3400', '33.3300'])
  expect(sale.accounts.map((account) => account.balance_due)).toEqual([
    '33.3400',
    '0.0000',
    '33.3300',
  ])
  expect(sale.payments).toHaveLength(1)
  expect(sale.balance_due).toBe('66.6700')
  const { data: updatedCash } = await readApi<{ data: { expected_amount: string } }>(
    page,
    `cash/sessions/${cash.id}`,
  )
  expect(updatedCash.expected_amount).toBe('1033.3400')
})
