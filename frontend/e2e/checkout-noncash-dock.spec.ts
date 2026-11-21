import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { Sale } from '../src/features/sales/types'

test('Cobro integrado mantiene teclado para importe no efectivo y no mueve dinero de caja', async ({
  page,
}) => {
  test.setTimeout(100_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Terminal pago manual')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7258df',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza manual',
    sku: 'DOCK-MANUAL',
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
  await writeApi(page, 'POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    code: 'dock-transfer',
    name: 'Transferencia prueba',
    kind: 'non_cash',
    is_active: true,
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', `cash/registers/${register.id}/open`, {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '0',
      currency: 'COP',
    })
  ).data
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.goto('/terminal/recogidas')
  await page.getByRole('button', { name: 'Agregar Pizza manual', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await page.getByRole('button', { name: 'Pagar con Transferencia prueba', exact: true }).click()
  const keypad = page.getByRole('group', { name: 'Teclado de importe', exact: true })
  await keypad.getByRole('button', { name: 'Limpiar importe', exact: true }).click()
  for (const digit of ['1', '0', '0', '.', '0', '1'])
    await keypad.getByRole('button', { name: `Importe ${digit}`, exact: true }).click()
  await expect(page.getByLabel('Importe de este pago', { exact: true })).toHaveValue('100.01')
  await page.getByLabel('Referencia del pago', { exact: true }).fill('MANUAL-DOCK-001')
  const visible = await keypad.getByRole('button').evaluateAll((buttons) =>
    buttons.every((button) => {
      const r = button.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return (
        r.height >= 18 &&
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        !!hit &&
        (hit === button || button.contains(hit))
      )
    }),
  )
  expect(visible).toBe(true)
  await expect(
    page.getByRole('button', { name: 'Confirmar pago manual', exact: true }),
  ).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: 'Confirmar pago manual', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const sales = (await readApi<{ data: Sale[] }>(page, 'sales')).data
  expect(sales).toHaveLength(1)
  const sale = (await readApi<{ data: Sale }>(page, `sales/${sales[0].id}`)).data
  expect(sale.payments).toHaveLength(1)
  expect(sale.payments[0]).toMatchObject({
    method_kind: 'non_cash',
    amount: '100.0100',
    reference: 'MANUAL-DOCK-001',
  })
  expect(
    (await readApi<{ data: { expected_amount: string } }>(page, `cash/sessions/${cash.id}`)).data
      .expected_amount,
  ).toBe('0.0000')
})
