import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { formatMoney } from '../src/lib/money'

test('catálogo: crear, buscar, editar, agotar y conservar al desactivar una categoría', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/registro')
  await page.getByLabel('Nombre del restaurante', { exact: true }).fill('Casa Oliva Catálogo')
  await page.getByLabel('Tu nombre', { exact: true }).fill('Ana Pérez')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`catalog-${Date.now()}@example.test`)
  await page.getByLabel('Contraseña', { exact: true }).fill('SeguraNexora123')
  await page.getByLabel('Confirma tu contraseña').fill('SeguraNexora123')
  await page.getByRole('button', { name: 'Crear mi espacio de trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  await page.getByRole('link', { name: 'Categorías', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByLabel('Nombre de la categoría', { exact: true }).fill('Pizzas artesanales')
  await page
    .getByLabel('Descripción de la categoría')
    .fill('Masa de fermentación lenta, sabor de casa.')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pizzas artesanales', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await page.getByLabel('Nombre del producto', { exact: true }).fill('Pizza Margarita')
  await page.getByLabel('Código del producto (SKU)', { exact: true }).fill('MARGARITA')
  await page.getByRole('button', { name: 'Categoría: Elegir categoría', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Elige una categoría' })
    .getByRole('button', { name: 'Pizzas artesanales', exact: true })
    .click()
  await page
    .getByLabel('Descripción del producto')
    .fill('Tomate San Marzano, mozzarella y albahaca fresca.')
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('28900,125')
  await page.getByLabel('Costo de referencia (COP)', { exact: true }).fill('8200.0025')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pizza Margarita', exact: true })).toBeVisible()
  await expect(page.getByText(formatMoney('28900.1250'), { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pizza Margarita', exact: true })).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/catalog-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByLabel('Buscar productos').fill('NO-EXISTE')
  await expect(page.getByRole('heading', { name: 'No encontramos coincidencias' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await page.getByRole('button', { name: 'Editar producto Pizza Margarita' }).click()
  await expect(page.getByLabel('Costo de referencia (COP)')).toHaveValue('8200.0025')
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('31000')
  await page.getByLabel('Disponible (no agotado)', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.locator('.product-card').getByText('Agotado', { exact: true })).toBeVisible()
  await page.getByLabel('Disponibilidad de productos').selectOption('available')
  await expect(page.getByRole('heading', { name: 'No encontramos coincidencias' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Categorías', exact: true }).click()
  await page.getByRole('button', { name: 'Editar categoría Pizzas artesanales' }).click()
  await page.getByLabel('Categoría activa', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.locator('.category-card').getByText('Inactiva', { exact: true })).toBeVisible()
  await expect(page.getByText('1 producto', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true }).click()
  await expect(
    page.locator('.product-card').getByText('Categoría inactiva', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/catalog-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})

test('importes: conserva dígitos y cuatro decimales sin aritmética flotante', () => {
  expect(formatMoney('999999999999999.9999')).toContain('999.999.999.999.999,9999')
  expect(formatMoney('28900.1250')).toContain('28.900,125')
  expect(formatMoney('0.0001')).toContain('0,0001')
  expect(formatMoney('0.0000')).toContain('0,00')
  expect(formatMoney('1e6')).toBe('—')
})
