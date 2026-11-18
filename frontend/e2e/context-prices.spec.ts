import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Product, Variant } from '../src/features/catalog/types'
import type { ContextPrice } from '../src/features/catalog/context-price-types'
import type { Order } from '../src/features/operations/types'
import { formatMoney } from '../src/lib/money'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('precios contextuales: configurar, revisar carrito y conservar precio en reintento y recibo', async ({
  page,
}) => {
  test.setTimeout(300_000)
  page.setDefaultTimeout(20_000)
  await fixtureWorkspace(page, 'Oliva Precios')
  const branches = await readApi<{ id: number; name: string }[]>(page, 'branches')
  const first = branches[0]
  const second = await writeApi<{ id: number; name: string }>(page, 'POST', 'branches', {
    name: 'Terraza',
    code: 'TERRAZA',
    is_active: true,
  })
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  async function product(name: string, sku: string, price: string) {
    return (
      await writeApi<{ data: Product }>(page, 'POST', 'products', {
        name,
        sku,
        category_id: category.id,
        sale_price: price,
        currency: 'COP',
        is_active: true,
        is_available: true,
      })
    ).data
  }
  const pizza = await product('Pizza contexto', 'PIZZA-CTX', '100.0050')
  const drink = await product('Bebida contexto', 'BEB-CTX', '50')
  async function current(id: number) {
    return (await readApi<{ data: Product }>(page, `products/${id}`)).data
  }
  async function rules(id: number, variant?: number) {
    return (
      await readApi<{ data: ContextPrice[] }>(
        page,
        `products/${id}/context-prices${variant ? `?variant_id=${variant}` : ''}`,
      )
    ).data
  }
  await page.goto(`/productos/${pizza.id}`)
  async function newPrice(
    branch: number | null,
    channel: string,
    amount: string,
    title = 'Pizza contexto',
  ) {
    const scope =
      title === 'Grande'
        ? page.getByRole('dialog', { name: 'Precios · Grande', exact: true })
        : page
    if (title === 'Grande')
      await expect(
        page.getByRole('dialog', { name: 'Precios · Grande', exact: true }),
      ).toBeVisible()
    await scope.getByRole('button', { name: 'Nuevo precio', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Nuevo precio · ${title}`, exact: true })
    await dialog
      .getByLabel('Sucursal de la regla', { exact: true })
      .selectOption(branch ? String(branch) : '')
    await dialog.getByLabel('Canal de la regla', { exact: true }).selectOption(channel)
    await dialog.getByLabel('Importe del precio (COP)', { exact: true }).fill(amount)
    await dialog.getByRole('button', { name: 'Guardar precio', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  const priceBodies: string[] = []
  const pricePath = `**/api/v1/products/${pizza.id}/context-prices`
  await page.route(pricePath, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    priceBodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (priceBodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Nuevo precio', exact: true }).click()
  await page.getByLabel('Canal de la regla', { exact: true }).selectOption('dine_in')
  await page.getByLabel('Importe del precio (COP)', { exact: true }).fill('110.0050')
  await page.getByRole('button', { name: 'Guardar precio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar precio', exact: true })).toBeVisible()
  await expect(page.getByLabel('Importe del precio (COP)', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar precio', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(priceBodies).toHaveLength(2)
  expect(priceBodies[0]).toBe(priceBodies[1])
  await page.unroute(pricePath)
  await newPrice(first.id, 'all', '120.0050')
  await newPrice(first.id, 'dine_in', '130.0050')
  const branchRule = (await rules(pizza.id)).find(
    (rule) => rule.branch_id === first.id && rule.channel === 'all',
  )!
  // La identidad se muestra bloqueada; el PUT envía únicamente importe/estado y revisiones.
  await page
    .getByRole('button', { name: `Editar precio ${first.name} Todos los canales`, exact: true })
    .click()
  await expect(page.getByLabel('Sucursal de la regla', { exact: true })).toBeDisabled()
  await page.getByLabel('Importe del precio (COP)', { exact: true }).fill('121.0050')
  const updateRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' && request.url().endsWith(`/context-prices/${branchRule.id}`),
  )
  await page.getByRole('button', { name: 'Guardar precio', exact: true }).click()
  const update = (await updateRequest).postDataJSON()
  expect(update).not.toHaveProperty('branch_id')
  expect(update).not.toHaveProperty('channel')
  expect(update).not.toHaveProperty('variant_id')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await current(pizza.id)).sale_price).toBe('100.0050')
  await writeApi(page, 'POST', `products/${pizza.id}/modifier-groups`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current(pizza.id)).revision,
    currency: 'COP',
    name: 'Extras',
    kind: 'addon',
    min_select: 1,
    max_select: 1,
    position: 0,
    is_active: true,
    options: [{ name: 'Queso', extra_price: '2.5050', is_active: true, position: 0 }],
  })
  // Una regla del producto base no sustituye los precios de sus presentaciones.
  await writeApi(page, 'POST', `products/${drink.id}/context-prices`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: 1,
    currency: 'COP',
    branch_id: second.id,
    variant_id: null,
    channel: 'dine_in',
    amount: '40',
    is_active: true,
  })
  const variant = (
    await writeApi<{ data: Variant }>(page, 'POST', `products/${drink.id}/variants`, {
      product_revision: (await current(drink.id)).revision,
      currency: 'COP',
      name: 'Grande',
      sku: 'BEB-G',
      sale_price: '60',
      is_active: true,
      is_available: true,
    })
  ).data
  await page.goto(`/productos/${drink.id}`)
  await page.getByRole('button', { name: 'Precios de Grande', exact: true }).click()
  await newPrice(second.id, 'dine_in', '70.0050', 'Grande')
  await page
    .getByRole('dialog', { name: 'Precios · Grande', exact: true })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const registers = await readApi<{ data: { id: number; branch_id: number }[] }>(
    page,
    'cash/registers',
  )
  await writeApi(
    page,
    'POST',
    `cash/registers/${registers.data.find((register) => register.branch_id === second.id)!.id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Agregar Pizza contexto', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(formatMoney('121.0050'))
  await page.getByRole('checkbox', { name: /Queso/ }).check()
  await page.getByRole('button', { name: 'Agregar con estas opciones', exact: true }).click()
  await page.getByRole('button', { name: 'Sumar Pizza contexto', exact: true }).click()
  await page
    .getByLabel('Observación para Pizza contexto', { exact: true })
    .fill('Bien dorada, conservar')
  await page.getByLabel('Referencia del pedido', { exact: true }).fill('Mesa contexto')
  await expect(page.locator('.order-subtotal')).toContainText(formatMoney('247.02'))
  const changedRule = (await rules(pizza.id)).find((rule) => rule.id === branchRule.id)!
  await writeApi(page, 'PUT', `products/${pizza.id}/context-prices/${changedRule.id}`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current(pizza.id)).revision,
    revision: changedRule.revision,
    currency: 'COP',
    amount: '125.0050',
    is_active: true,
  })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('catálogo cambió')
  await page
    .getByRole('button', { name: 'Revisar precios conservando el pedido', exact: true })
    .click()
  const conflictReview = page.getByRole('dialog', {
    name: 'Revisar precios del pedido',
    exact: true,
  })
  await expect(conflictReview).toContainText(formatMoney('255.02'))
  await conflictReview
    .getByRole('button', { name: 'Aplicar precios revisados', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Observación para Pizza contexto', { exact: true })).toHaveValue(
    'Bien dorada, conservar',
  )
  const previews: unknown[] = []
  await page.route('**/api/v1/orders/preview', async (route) => {
    previews.push(route.request().postDataJSON())
    await route.continue()
  })
  await page.getByLabel('Tipo de pedido', { exact: true }).selectOption('dine_in')
  const review = page.getByRole('dialog', { name: 'Revisar precios del pedido', exact: true })
  await expect(review).toContainText(formatMoney('265.02'))
  await review.getByRole('button', { name: 'Conservar contexto anterior', exact: true }).click()
  await expect(page.getByLabel('Tipo de pedido', { exact: true })).toHaveValue('takeaway')
  await expect(page.locator('.order-subtotal')).toContainText(formatMoney('255.02'))
  await page.getByLabel('Tipo de pedido', { exact: true }).selectOption('dine_in')
  await review.getByRole('button', { name: 'Aplicar precios revisados', exact: true }).click()
  await expect(page.getByLabel('Tipo de pedido', { exact: true })).toHaveValue('dine_in')
  await page.getByLabel('Sucursal de operación', { exact: true }).selectOption(String(second.id))
  await expect(review).toContainText('Terraza')
  await expect(review).toContainText(formatMoney('225.02'))
  await page.setViewportSize({ width: 390, height: 844 })
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.screenshot({
    path: '../docs/screenshots/context-price-review-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await review.getByRole('button', { name: 'Aplicar precios revisados', exact: true }).click()
  await expect(page.getByLabel('Observación para Pizza contexto', { exact: true })).toHaveValue(
    'Bien dorada, conservar',
  )
  await expect(page.getByLabel('Referencia del pedido', { exact: true })).toHaveValue(
    'Mesa contexto',
  )
  await expect(page.locator('.quantity-stepper')).toContainText('2')
  const preview = previews.at(-1) as { items: Record<string, unknown>[] }
  expect(preview.items[0]).not.toHaveProperty('expected_unit_price')
  expect(preview.items[0]).not.toHaveProperty('price_context')
  await page.getByRole('button', { name: 'Agregar Bebida contexto', exact: true }).click()
  const picker = page.getByRole('dialog', {
    name: 'Elige la presentación · Bebida contexto',
    exact: true,
  })
  await expect(picker).toContainText(formatMoney('70.0050'))
  await picker.getByRole('button', { name: /Grande/ }).click()
  await expect(page.locator('.order-subtotal')).toContainText(formatMoney('295.0250'))
  expect((await readApi<{ meta: { total: number } }>(page, 'orders')).meta.total).toBe(0)
  const bodies: string[] = []
  await page.route('**/api/v1/orders', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    bodies.push(route.request().postData()!)
    const response = await route.fetch()
    if (bodies.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
  await expect(page.getByLabel('Sucursal de operación', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Tipo de pedido', { exact: true })).toBeDisabled()
  const variantRule = (await rules(drink.id, variant.id))[0]
  await writeApi(page, 'PUT', `products/${drink.id}/context-prices/${variantRule.id}`, {
    idempotency_key: crypto.randomUUID(),
    product_revision: (await current(drink.id)).revision,
    revision: variantRule.revision,
    currency: 'COP',
    amount: '900',
    is_active: false,
  })
  await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
  await page.waitForURL(/\/pedidos\/\d+$/)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toBe(bodies[1])
  const order = (await readApi<{ data: Order }>(page, `orders/${page.url().split('/').at(-1)!}`))
    .data
  expect(order.subtotal).toBe('295.0250')
  expect(order.items![0].notes).toBe('Bien dorada, conservar')
  expect(order.items![0].price_snapshot!.amount).toBe('110.0050')
  expect(order.items![1].price_snapshot!.amount).toBe('70.0050')
  await expect(page.locator('.saved-order-item').first()).toContainText(
    'Precio por sucursal/canal conservado',
  )
  await page.getByRole('link', { name: 'Cobrar pedido', exact: true }).click()
  await expect(page.locator('.checkout-summary')).toContainText('Terraza')
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText(formatMoney('295.03'))
  await expect(page.getByRole('article')).toContainText('Precio por sucursal/canal conservado')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../docs/screenshots/context-price-receipt-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})
