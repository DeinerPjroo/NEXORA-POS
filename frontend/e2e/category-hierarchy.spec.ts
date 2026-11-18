import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('subcategorías: seleccionar principal paginada, filtrar y heredar disponibilidad sin cambiar pedidos', async ({
  page,
}) => {
  test.setTimeout(240_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Menú')
  for (let index = 0; index < 10; index++)
    await writeApi(page, 'POST', 'categories', {
      name: `A Principal ${index}`,
      color: '#8271FF',
      is_active: true,
    })
  await page.goto('/categorias')
  await page.getByRole('button', { name: 'Nueva categoría', exact: true }).click()
  await page.getByLabel('Nombre de la categoría', { exact: true }).fill('ZZ Platos')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ZZ Platos', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nueva categoría', exact: true }).click()
  await page.getByLabel('Nombre de la categoría', { exact: true }).fill('Pizzas')
  await page
    .getByRole('button', { name: 'Categoría principal: Sin principal', exact: true })
    .click()
  const parentPicker = page.getByRole('dialog', {
    name: 'Elige una categoría principal',
    exact: true,
  })
  await expect(parentPicker.getByRole('button', { name: 'ZZ Platos', exact: true })).toHaveCount(0)
  await parentPicker.getByRole('button', { name: 'Página siguiente', exact: true }).click()
  await expect(parentPicker.getByRole('button', { name: 'ZZ Platos', exact: true })).toBeVisible()
  await parentPicker.getByLabel('Buscar categoría', { exact: true }).fill('ZZ Platos')
  await expect(parentPicker.getByText('Página 1 de 1', { exact: true })).toBeVisible()
  await parentPicker.getByRole('button', { name: 'ZZ Platos', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await page.getByLabel('Nivel de categorías', { exact: true }).selectOption('child')
  await expect(page.getByRole('heading', { name: 'Pizzas', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ZZ Platos', exact: true })).toHaveCount(0)
  await expect(
    page.locator('.category-card').getByText('En ZZ Platos', { exact: true }),
  ).toBeVisible()
  await page.goto('/productos')
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click()
  await page.getByLabel('Nombre del producto', { exact: true }).fill('Pizza de la casa')
  await page.getByLabel('Código del producto (SKU)', { exact: true }).fill('HIER-1')
  await page.getByRole('button', { name: 'Categoría: Elegir categoría', exact: true }).click()
  const categoryPicker = page.getByRole('dialog', { name: 'Elige una categoría', exact: true })
  await categoryPicker.getByLabel('Buscar categoría', { exact: true }).fill('Pizzas')
  await categoryPicker.getByRole('button', { name: 'ZZ Platos / Pizzas', exact: true }).click()
  await page.getByLabel('Precio de venta (COP)', { exact: true }).fill('10.01')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pizza de la casa', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Categoría: Todas', exact: true }).click()
  await categoryPicker.getByLabel('Buscar categoría', { exact: true }).fill('ZZ Platos')
  await categoryPicker.getByRole('button', { name: 'ZZ Platos', exact: true }).click()
  await expect(
    page.getByText('Esta categoría principal incluye sus subcategorías.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pizza de la casa', exact: true })).toBeVisible()
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Agregar Pizza de la casa', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  const orderUrl = page.url()
  const orderId = orderUrl.split('/').at(-1)!
  const original = await readApi<{ data: { subtotal: string; revision: number } }>(
    page,
    `orders/${orderId}`,
  )
  expect(original.data.subtotal).toBe('10.0100')
  await page.goto('/categorias')
  await page.getByLabel('Buscar categorías', { exact: true }).fill('ZZ Platos')
  await page.getByRole('button', { name: 'Editar categoría ZZ Platos', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Categoría principal: Sin principal', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Categoría activa', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.locator('.category-card').getByText('Inactiva', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver subcategorías de ZZ Platos', exact: true }).click()
  await expect(
    page.locator('.category-card').getByText('Principal inactiva', { exact: true }),
  ).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/subcategories-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto('/productos')
  await expect(
    page.locator('.product-card').getByText('Categoría principal inactiva', { exact: true }),
  ).toBeVisible()
  await page.goto('/pedidos/nuevo')
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza de la casa', exact: true }),
  ).toBeDisabled()
  await page.goto(orderUrl)
  await expect(page.getByRole('heading', { name: `Pedido #${orderId}`, exact: true })).toBeVisible()
  expect(
    (await readApi<{ data: { subtotal: string; revision: number } }>(page, `orders/${orderId}`))
      .data,
  ).toMatchObject(original.data)
  await page.goto('/categorias')
  await page.getByLabel('Buscar categorías', { exact: true }).fill('ZZ Platos')
  await page.getByRole('button', { name: 'Editar categoría ZZ Platos', exact: true }).click()
  await page.getByLabel('Categoría activa', { exact: true }).check()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.locator('.category-card').getByText('Activa', { exact: true })).toBeVisible()
  await page.goto('/pedidos/nuevo')
  await expect(
    page.getByRole('button', { name: 'Agregar Pizza de la casa', exact: true }),
  ).toBeEnabled()
  await page.goto('/categorias')
  await page.getByLabel('Nivel de categorías', { exact: true }).selectOption('child')
  await expect(page.getByRole('heading', { name: 'Pizzas', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/subcategories-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})
