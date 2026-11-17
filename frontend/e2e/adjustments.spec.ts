import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'
import { registerWorkspace, writeApi } from './helpers'

test('descuento porcentual y propina voluntaria: confirmar política, calcular y conservar recibo', async ({
  page,
}) => {
  test.setTimeout(160_000)
  await registerWorkspace(page, 'Oliva Propinas', 'tips')
  await page.goto('/ventas/configuracion')
  await page.getByLabel('Cálculo de impuesto', { exact: true }).selectOption('exclusive')
  await page.getByLabel('Nombre del impuesto', { exact: true }).fill('Impuesto de prueba')
  await page.getByLabel('Tasa adicional (%)', { exact: true }).fill('8.1250')
  await page
    .getByRole('checkbox', { name: 'Permitir registro de propinas voluntarias', exact: true })
    .check()
  await page
    .getByLabel('Tratamiento de la propina en la base', { exact: true })
    .selectOption('excluded')
  await page
    .getByRole('checkbox', {
      name: 'Confirmo esta configuración para los próximos cobros.',
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Confirmar configuración', exact: true }).click()
  await expect(page.getByText('Configuración de ventas confirmada.', { exact: true })).toBeVisible()
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Especiales',
    color: '#8271FF',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Menú especial',
    sku: 'MENU-TIP',
    category_id: category.id,
    sale_price: '100.0050',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.getByRole('navigation').getByRole('link', { name: 'Caja', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await page.getByLabel('Base inicial de caja').fill('1000')
  await page.getByRole('button', { name: 'Confirmar apertura', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'El recorrido de tu efectivo' })).toBeVisible()
  const cashUrl = page.url()
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Agregar Menú especial', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await page.getByLabel('Tipo de descuento', { exact: true }).selectOption('percentage')
  await page.getByLabel('Descuento (%)', { exact: true }).fill('12.50')
  await page.getByLabel('Propina voluntaria', { exact: true }).fill('5.25')
  await page.getByRole('button', { name: 'Actualizar total', exact: true }).click()
  await expect(
    page.locator('.sale-grand-total').getByText(formatMoney('99.87'), { exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Motivo del descuento', { exact: true })
    .fill('Beneficio autorizado de prueba')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('100')
  const submit = page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true })
  await expect(submit).toBeDisabled()
  await page
    .getByRole('checkbox', {
      name: 'Confirmo que el cliente aceptó esta propina voluntariamente.',
      exact: true,
    })
    .check()
  await expect(submit).toBeEnabled()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/tip-checkout.png',
    fullPage: true,
    animations: 'disabled',
  })
  await submit.click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const receiptUrl = page.url()
  await expect(page.getByText('Descuento (12.5 %)', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Propina voluntaria · Fuera de la base', { exact: true }),
  ).toBeVisible()
  await page.goto('/ventas/configuracion')
  await page
    .getByLabel('Tratamiento de la propina en la base', { exact: true })
    .selectOption('included')
  await page
    .getByRole('checkbox', {
      name: 'Confirmo esta configuración para los próximos cobros.',
      exact: true,
    })
    .check()
  await page.getByRole('button', { name: 'Confirmar configuración', exact: true }).click()
  await expect(page.getByText('Configuración de ventas confirmada.', { exact: true })).toBeVisible()
  await page.goto(receiptUrl)
  await expect(
    page.getByText('Propina voluntaria · Fuera de la base', { exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('.sale-grand-total').first().getByText(formatMoney('99.87'), { exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/tip-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto(cashUrl)
  await expect(page.getByText(formatMoney('1099.87'), { exact: true })).toBeVisible()
  await page.goto(receiptUrl)
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Devolución de cobro y propina')
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
  await page.goto(cashUrl)
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await page.getByLabel('Efectivo contado al cierre').fill('1000')
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(
    page.getByText('Cierre registrado. Los movimientos se conservan.', { exact: true }),
  ).toBeVisible()
})
