import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'
import type { Sale } from '../src/features/sales/types'
import type { TaxProfile } from '../src/features/sales/tax-types'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('impuestos por producto: perfiles, snapshots, propina explícita, cuentas y caja', async ({
  page,
}) => {
  test.setTimeout(360_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Impuestos')
  await page.goto('/ventas/impuestos')
  async function createProfile(name: string, mode: 'exclusive' | 'inclusive') {
    await page.getByRole('button', { name: 'Nuevo perfil', exact: true }).click()
    await page.getByLabel('Nombre del perfil', { exact: true }).fill(name)
    await page.getByLabel('Precio del perfil', { exact: true }).selectOption(mode)
    await page.getByLabel('Nombre del impuesto 1', { exact: true }).fill('Tasa A de prueba')
    await page.getByLabel('Tasa del impuesto 1 (%)', { exact: true }).fill('8')
    await page.getByRole('button', { name: 'Agregar impuesto al perfil', exact: true }).click()
    await page.getByLabel('Nombre del impuesto 2', { exact: true }).fill('Tasa B de prueba')
    await page.getByLabel('Tasa del impuesto 2 (%)', { exact: true }).fill('2')
    await page.getByRole('button', { name: 'Guardar perfil de impuestos', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  }
  await createProfile('Perfil adicional', 'exclusive')
  await createProfile('Perfil incluido', 'inclusive')
  const profiles = await readApi<{ data: TaxProfile[] }>(page, 'tax-profiles?status=all')
  const inclusive = profiles.data.find((profile) => profile.price_mode === 'inclusive')!
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Especiales',
    color: '#8271FF',
    is_active: true,
  })
  const base = { category_id: category.id, currency: 'COP', is_active: true, is_available: true }
  const first = await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
    ...base,
    name: 'Menú adicional',
    sku: 'TAX-1',
    sale_price: '100.0050',
  })
  await writeApi(page, 'POST', 'products', {
    ...base,
    name: 'Menú incluido',
    sku: 'TAX-2',
    sale_price: '110.0050',
    tax_profile_id: inclusive.id,
    tax_profile_revision: 1,
  })
  await writeApi(page, 'POST', 'products', {
    ...base,
    name: 'Menú sin perfil',
    sku: 'TAX-3',
    sale_price: '10.0050',
  })
  await page.goto(`/productos/${first.data.id}`)
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click()
  await page.getByRole('button', { name: 'Perfil de impuestos: Sin perfil', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un perfil de impuestos', exact: true })
    .getByRole('button', { name: /Perfil adicional/ })
    .click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/Perfil adicional · Adicionales/)).toBeVisible()
  await page.goto('/ventas/configuracion')
  await page.getByLabel('Cálculo de impuesto', { exact: true }).selectOption('product')
  await page
    .getByRole('checkbox', { name: 'Permitir registro de propinas voluntarias', exact: true })
    .check()
  await page
    .getByLabel('Tratamiento de la propina en la base', { exact: true })
    .selectOption('included')
  await expect(
    page.getByRole('button', { name: 'Confirmar configuración', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Perfil de impuestos: Sin perfil', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un perfil de impuestos', exact: true })
    .getByRole('button', { name: /Perfil incluido/ })
    .click()
  await page
    .getByRole('checkbox', {
      name: 'Confirmo esta configuración para los próximos cobros.',
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Confirmar configuración', exact: true }).click()
  await expect(page.getByText('Configuración de ventas confirmada.', { exact: true })).toBeVisible()
  const registers = await readApi<{ data: { id: number }[] }>(page, 'cash/registers')
  const session = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${registers.data[0].id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  await writeApi(page, 'POST', 'payment-methods', {
    idempotency_key: crypto.randomUUID(),
    name: 'Transferencia manual',
    code: 'transfer',
    kind: 'non_cash',
    is_active: true,
  })
  await page.goto('/pedidos/nuevo')
  for (const name of ['Menú adicional', 'Menú incluido', 'Menú sin perfil'])
    await page.getByRole('button', { name: `Agregar ${name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByText(/Perfil conservado: Perfil adicional/)).toBeVisible()
  const orderUrl = page.url()
  await page.goto('/ventas/impuestos')
  await page.getByRole('button', { name: 'Editar perfil Perfil adicional', exact: true }).click()
  await page.getByLabel('Tasa del impuesto 1 (%)', { exact: true }).fill('100')
  await page
    .getByRole('checkbox', { name: 'Perfil activo para nuevos pedidos', exact: true })
    .uncheck()
  await page.getByRole('button', { name: 'Guardar perfil de impuestos', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto(orderUrl)
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await page.getByLabel('Descuento en dinero', { exact: true }).fill('22')
  await page.getByLabel('Propina voluntaria', { exact: true }).fill('5.25')
  await page.getByRole('button', { name: 'Actualizar total', exact: true }).click()
  await expect(
    page.locator('.sale-grand-total').getByText(formatMoney('212.27'), { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Desglose de impuestos', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Dividir cuenta', { exact: true }).selectOption('2')
  await expect(page.getByLabel('Cuenta del primer pago', { exact: true })).toBeVisible()
  await page.getByLabel('Importe de este pago', { exact: true }).fill('10')
  await page
    .getByLabel('Motivo del descuento', { exact: true })
    .fill('Descuento distribuido en centavos')
  await page
    .getByRole('checkbox', {
      name: 'Confirmo que el cliente aceptó esta propina voluntariamente.',
      exact: true,
    })
    .check()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const saleUrl = page.url()
  const saleId = Number(saleUrl.split('/').at(-1))
  const sale = await readApi<{ data: Sale }>(page, `sales/${saleId}`)
  expect(sale.data.calculation_version).toBe(3)
  expect(sale.data.total).toBe('212.2700')
  expect(sale.data.tax_breakdown!.included_tax_amount).toBe('9.4800')
  expect(sale.data.tax_breakdown!.additional_tax_amount).toBe('9.0000')
  expect(sale.data.tax_breakdown!.items[0].profile.revision).toBe(1)
  await page.getByRole('button', { name: 'Agregar pagos', exact: true }).click()
  await expect(page.getByLabel('Importe a agregar', { exact: true })).toHaveValue('96.14')
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Método: Efectivo', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige un método de pago', exact: true })
    .getByRole('button', { name: /Transferencia manual/ })
    .click()
  await expect(page.getByLabel('Importe a agregar', { exact: true })).toHaveValue('106.13')
  await page.getByLabel('Referencia del pago a agregar', { exact: true }).fill('TAX-TRANSFER-1')
  await page.getByRole('button', { name: 'Agregar pago al lote', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar lote de pagos', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agregar pagos', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: '../docs/screenshots/product-tax-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await writeApi(page, 'PUT', `tax-profiles/${inclusive.id}`, {
    revision: 1,
    name: inclusive.name,
    price_mode: 'inclusive',
    rates: [{ name: 'Nueva tasa', rate: '50' }],
    is_active: true,
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const preserved = await readApi<{ data: Sale }>(page, `sales/${saleId}`)
  expect(preserved.data.tax_breakdown!.tip!.profile.revision).toBe(1)
  expect(preserved.data.tax_amount).toBe('18.4800')
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Devolución con impuestos históricos por producto')
  await page.getByLabel('Referencia de la devolución', { exact: true }).fill('TAX-DEV-1')
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
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
