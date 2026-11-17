import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { cartSubtotal } from '../src/features/orders/cart'
import { formatMoney, moneyUnits } from '../src/lib/money'

test('caja y pedidos: recuperar respuesta perdida, arqueo y preparación sin duplicados', async ({
  page,
}) => {
  test.setTimeout(140_000)
  await page.goto('/registro')
  await page.getByLabel('Nombre del restaurante', { exact: true }).fill('Casa Oliva Operación')
  await page.getByLabel('Tu nombre', { exact: true }).fill('Ana Pérez')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`operations-${Date.now()}@example.test`)
  await page.getByLabel('Contraseña', { exact: true }).fill('SeguraNexora123')
  await page.getByLabel('Confirma tu contraseña').fill('SeguraNexora123')
  await page.getByRole('button', { name: 'Crear mi espacio de trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Caja', exact: true }).click()
  let lost = false
  await page.route('**/api/v1/cash/registers/*/open', async (route) => {
    const response = await route.fetch()
    if (!lost) {
      lost = true
      await route.abort('failed')
    } else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await page.getByLabel('Base inicial de caja').fill('100000')
  await page.getByRole('button', { name: 'Confirmar apertura', exact: true }).click()
  await expect(
    page.getByText('No pudimos confirmar si el servidor guardó la operación.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByLabel('Base inicial de caja')).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'El recorrido de tu efectivo' })).toBeVisible()
  await page.unroute('**/api/v1/cash/registers/*/open')
  const cashUrl = page.url()
  await page.getByRole('button', { name: 'Registrar ingreso', exact: true }).click()
  await page.getByLabel('Importe del movimiento').fill('2500.125')
  await page.getByLabel('Motivo del movimiento').fill('Ingreso manual de caja')
  await page.getByRole('button', { name: 'Guardar operación', exact: true }).click()
  await expect(page.getByRole('row', { name: /Ingreso manual de caja/ })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar egreso', exact: true }).click()
  await page.getByLabel('Importe del movimiento').fill('500')
  await page.getByLabel('Motivo del movimiento').fill('Retiro manual de efectivo')
  await page.getByRole('button', { name: 'Guardar operación', exact: true }).click()
  await expect(page.getByRole('row', { name: /Retiro manual de efectivo/ })).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/cash-session.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await page.getByLabel('Efectivo contado al cierre').fill('101900')
  await page.getByLabel('Observación del cierre').fill('Conteo de prueba')
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(
    page.getByText('Cierre registrado. Los movimientos se conservan.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(formatMoney('-100.1250'), { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Volver a caja', exact: true }).click()
  await expect(page.getByRole('row', { name: /Caja principal.*Cerrada/ })).toHaveCount(1)
  await page.getByRole('navigation').getByRole('link', { name: 'Categorías', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Especiales')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Especiales', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await page.getByLabel('Nombre del producto', { exact: true }).fill('Menú del día')
  await page.getByLabel('Código del producto (SKU)').fill('MENU')
  await page.getByRole('button', { name: 'Categoría: Elegir categoría' }).click()
  await page
    .getByRole('dialog', { name: 'Elige una categoría' })
    .getByRole('button', { name: 'Especiales', exact: true })
    .click()
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('18500.125')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Menú del día', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('link', { name: 'Nuevo pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Menú del día', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Menú del día', exact: true }).click()
  await page.getByLabel('Observación para Menú del día', { exact: true }).fill('Sin cebolla')
  await page.getByLabel('Referencia del pedido', { exact: true }).fill('Recoge Ana')
  await expect(page.getByText(formatMoney('37000.2500'), { exact: true }).last()).toBeVisible()
  await page.screenshot({
    path: '../docs/screenshots/order-composer.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Detalle del pedido' })).toBeVisible()
  const originalOrderUrl = page.url()
  await expect(page.getByText('Sin cebolla', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Enviar a preparación', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar como listo', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar como entregado', exact: true }).click()
  await expect(
    page.locator('.order-items-panel').getByText('Entregado', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.locator('.order-items-panel').getByText('Entregado', { exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/order-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true }).click()
  await page.getByRole('link', { name: 'Ver ficha y presentaciones', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva variante', exact: true }).click()
  await page.getByLabel('Nombre de la variante').fill('Completo')
  await page.getByLabel('SKU de la variante', { exact: true }).fill('MENU-C')
  await page.getByLabel('Precio de la variante (COP)', { exact: true }).fill('22000.0025')
  await page.getByRole('button', { name: 'Guardar variante', exact: true }).click()
  await expect(page.getByRole('row', { name: /Completo MENU-C/ })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('link', { name: 'Nuevo pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Menú del día', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Completo/ })
    .click()
  await expect(page.getByText(formatMoney('22000.0025'), { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Detalle del pedido' })).toBeVisible()
  await expect(page.locator('.order-items-panel').getByText(/Completo/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click()
  await page.getByLabel('Motivo de la cancelación').fill('El cliente desistió antes de preparar')
  await page.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click()
  await expect(
    page.locator('.order-items-panel').getByText('Cancelado', { exact: true }),
  ).toBeVisible()
  await page.goto(originalOrderUrl)
  await expect(page.getByText(formatMoney('37000.2500'), { exact: true }).last()).toBeVisible()
  await page.goto(cashUrl)
  await expect(page.getByText(formatMoney('102000.1250'), { exact: true })).toBeVisible()
})

test('precisión del borrador y diferencias negativas de arqueo', () => {
  expect(formatMoney('-0.1250')).toContain('0,125')
  expect(formatMoney('-0.1250')).toContain('-')
  expect(moneyUnits('-0.1250')).toBe(-1250n)
  expect(
    cartSubtotal([
      {
        key: 'x',
        product_id: 1,
        variant_id: null,
        product_name: 'Prueba',
        variant_name: null,
        product_revision: 1,
        expected_unit_price: '0.1234',
        quantity: 3,
        notes: '',
      },
    ]),
  ).toBe('0.3702')
})
