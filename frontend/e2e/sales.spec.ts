import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'

test('venta en efectivo: impuesto configurado, descuento, cambio, reintentos y devolución', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto('/registro')
  await page.getByLabel('Nombre del restaurante', { exact: true }).fill('Oliva Ventas')
  await page.getByLabel('Tu nombre', { exact: true }).fill('Ana Pérez')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`sales-${Date.now()}@example.test`)
  await page.getByLabel('Contraseña', { exact: true }).fill('SeguraNexora123')
  await page.getByLabel('Confirma tu contraseña').fill('SeguraNexora123')
  await page.getByRole('button', { name: 'Crear mi espacio de trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Ventas', exact: true }).click()
  await page.getByRole('link', { name: 'Configurar ventas', exact: true }).click()
  await page.getByLabel('Cálculo de impuesto', { exact: true }).selectOption('exclusive')
  await page.getByLabel('Nombre del impuesto', { exact: true }).fill('Impuesto de prueba')
  await page.getByLabel('Tasa adicional (%)', { exact: true }).fill('8.1250')
  await page
    .getByRole('checkbox', { name: 'Confirmo esta configuración para los próximos cobros.' })
    .check()
  await page.getByRole('button', { name: 'Confirmar configuración', exact: true }).click()
  await expect(page.getByText('Configuración de ventas confirmada.', { exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Caja', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await page.getByLabel('Base inicial de caja').fill('1000')
  await page.getByRole('button', { name: 'Confirmar apertura', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'El recorrido de tu efectivo' })).toBeVisible()
  const cashUrl = page.url()
  await page.getByRole('navigation').getByRole('link', { name: 'Categorías', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Especiales')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Especiales', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await page.getByLabel('Nombre del producto', { exact: true }).fill('Menú de prueba')
  await page.getByLabel('Código del producto (SKU)').fill('MENU-VENTA')
  await page.getByRole('button', { name: 'Categoría: Elegir categoría' }).click()
  await page
    .getByRole('dialog', { name: 'Elige una categoría' })
    .getByRole('button', { name: 'Especiales', exact: true })
    .click()
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('123.4567')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Menú de prueba', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('link', { name: 'Nuevo pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Menú de prueba', exact: true }).click()
  await page
    .getByRole('button', { name: 'Sumar Menú de prueba', exact: true })
    .click({ clickCount: 2 })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Detalle del pedido' })).toBeVisible()
  const orderUrl = page.url()
  await page.getByRole('link', { name: 'Cobrar en efectivo', exact: true }).click()
  await page.getByLabel('Descuento en dinero', { exact: true }).fill('10.12')
  await page.getByRole('button', { name: 'Actualizar total', exact: true }).click()
  await expect(
    page.locator('.sale-grand-total').getByText(formatMoney('389.5200'), { exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Motivo del descuento', { exact: true })
    .fill('Descuento autorizado de prueba')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('400')
  await expect(
    page.locator('.checkout-change').getByText(formatMoney('10.4800'), { exact: true }),
  ).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/checkout-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  let lost = false
  await page.route('**/api/v1/orders/*/collect', async (route) => {
    const response = await route.fetch()
    if (!lost) {
      lost = true
      await route.abort('failed')
    } else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(
    page.getByText('No pudimos confirmar si el servidor guardó la operación.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByLabel('Efectivo recibido', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar cobro', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const receiptUrl = page.url()
  await page.unroute('**/api/v1/orders/*/collect')
  await expect(
    page.getByRole('article', { name: 'Recibo V-000001' }).getByText('Cobrada', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: '../docs/screenshots/receipt-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('article', { name: 'Recibo V-000001' })).toBeVisible()
  await expect(page.getByRole('navigation')).toBeHidden()
  await page.pdf({
    path: '../docs/screenshots/internal-receipt.pdf',
    format: 'A4',
    printBackground: true,
  })
  await page.emulateMedia({ media: 'screen' })
  await page.goto(orderUrl)
  await expect(page.getByRole('link', { name: 'Ver recibo de venta', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar pedido', exact: true })).toHaveCount(0)
  await page.goto(cashUrl)
  await expect(page.getByText(formatMoney('1389.5200'), { exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /Cobro recibo V-000001/ })).toHaveCount(1)
  await page.goto(receiptUrl)
  await page.getByRole('button', { name: 'Devolución total', exact: true }).click()
  await page
    .getByLabel('Motivo de la devolución', { exact: true })
    .fill('Devolución total solicitada por el cliente')
  let refundLost = false
  await page.route('**/api/v1/sales/*/refund', async (route) => {
    const response = await route.fetch()
    if (!refundLost) {
      refundLost = true
      await route.abort('failed')
    } else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Confirmar devolución total', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reintentar devolución', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar devolución', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Devolución total registrada', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Devolución total', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('article', { name: 'Recibo V-000001' }).getByText('Devuelta', { exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto(cashUrl)
  await expect(page.getByText(formatMoney('1000.0000'), { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('row', { name: /Devolución recibo V-000001/ })).toHaveCount(1)
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await page.getByLabel('Efectivo contado al cierre').fill('1000')
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(
    page.getByText('Cierre registrado. Los movimientos se conservan.', { exact: true }),
  ).toBeVisible()
})
