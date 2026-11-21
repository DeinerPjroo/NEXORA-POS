import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import { formatMoney } from '../src/lib/money'
import type { Sale } from '../src/features/sales/types'

async function expectFixedPaymentDock(page: import('@playwright/test').Page) {
  const keypad = page.getByRole('group', { name: 'Teclado de efectivo', exact: true })
  await expect(keypad).toBeVisible()
  const suggestions = page.getByRole('group', { name: 'Importes rápidos', exact: true })
  await expect(suggestions).toBeVisible()
  const suggestionBounds = await suggestions.boundingBox()
  const keyBounds = await keypad.boundingBox()
  expect(suggestionBounds!.y + suggestionBounds!.height).toBeLessThanOrEqual(keyBounds!.y)
  expect(
    await suggestions.evaluate((node) =>
      node.parentElement?.classList.contains('payment-tender-dock'),
    ),
  ).toBe(true)
  const positions = await keypad.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      let clipped = false
      for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor)
        if (!['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowY)) continue
        const bounds = ancestor.getBoundingClientRect()
        if (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) clipped = true
      }
      return (
        rect.width > 0 &&
        rect.height >= 20 &&
        !clipped &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        !!hit &&
        (hit === button || button.contains(hit))
      )
    }),
  )
  expect(positions).toHaveLength(13)
  expect(positions.every(Boolean)).toBe(true)
  const top = await keypad.evaluate((node) => node.getBoundingClientRect().top)
  await page.locator('.terminal-checkout .payment-secondary-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  expect(await keypad.evaluate((node) => node.getBoundingClientRect().top)).toBe(top)
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  )
}

test('POS: división táctil, centavos exactos y pago de la cuenta elegida sin duplicados', async ({
  page,
}) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(20_000)
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
  const { data: registers } = await readApi<{ data: { id: number; branch_id: number }[] }>(
    page,
    'cash/registers',
  )
  const { data: cash } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    `cash/registers/${registers[0].id}/open`,
    { idempotency_key: crypto.randomUUID(), opening_amount: '1000', currency: 'COP' },
  )
  await page.goto('/pos')
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: registers[0].branch_id,
    name: 'Sala división',
    color: '#7258df',
    is_active: true,
  })
  const { data: table } = await writeApi<{ data: { id: number; revision: number } }>(
    page,
    'POST',
    `dining-rooms/${room.id}/tables`,
    {
      idempotency_key: crypto.randomUUID(),
      room_revision: 1,
      name: 'Mesa división',
      capacity: 4,
      shape: 'square',
      color: '#7258df',
      is_active: true,
    },
  )
  const { data: dining } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    'dining-sessions',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: registers[0].branch_id,
      guest_count: 2,
      tables: [{ id: table.id, revision: table.revision }],
      notes: '',
      waiter_id: null,
    },
  )
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await page.getByRole('button', { name: 'Seleccionar Mesa división', exact: true }).click()
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
  await expectFixedPaymentDock(page)
  await page.setViewportSize({ width: 1024, height: 600 })
  await expectFixedPaymentDock(page)
  await page.screenshot({ path: 'test-results/checkout-integrated-compact.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectFixedPaymentDock(page)
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
  await expect(page.getByRole('region', { name: 'Cobrar saldo pendiente' })).toBeVisible()
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
  await page.getByRole('button', { name: 'Volver al pedido', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await page.getByRole('button', { name: 'Seleccionar Mesa división', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Líneas del pedido', exact: true })).toContainText(
    'Cuenta compartida',
  )
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Cobrar pedido #/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cobrar saldo pendiente' })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.pending-checkout-grid')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Caja de la operación', { exact: true })).not.toHaveValue('')
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('40')
  const changeDue = page.getByRole('region', { name: 'Cambio a devolver', exact: true })
  await expect(changeDue).toContainText(formatMoney('6.66'))
  await expect(
    page.locator('.digital-tender-status').getByText('Cambio', { exact: true }),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 1024, height: 600 })
  await expectFixedPaymentDock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page
    .locator('.pos-terminal')
    .screenshot({ path: 'test-results/pending-checkout-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.getByRole('button', { name: /Cuenta 3 ·/ }).click()
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('40')
  await page.getByRole('button', { name: 'Preparar pago de esta cuenta', exact: true }).click()
  await expect(changeDue).toContainText(formatMoney('6.67'))
  await page.getByRole('button', { name: 'Confirmar pagos preparados', exact: true }).click()
  await expect(page.getByRole('button', { name: /Cuenta 3 · Pagada/ })).toBeDisabled()
  await page.getByRole('button', { name: /Cuenta 1 ·/ }).click()
  await page.getByLabel('Efectivo recibido para este pago', { exact: true }).fill('40')
  await page.getByRole('button', { name: 'Preparar pago de esta cuenta', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pagos preparados', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Recibo V-/ })).toBeVisible()
  const { data: completed } = await readApi<{ data: Sale }>(page, `sales/${sale.id}`)
  expect(completed.balance_due).toBe('0.0000')
  expect(completed.payments).toHaveLength(3)
  expect(
    (await readApi<{ data: unknown[] }>(page, `dining-sessions/${dining.id}/orders?pending=1`))
      .data,
  ).toHaveLength(0)
  const { data: updatedCash } = await readApi<{ data: { expected_amount: string } }>(
    page,
    `cash/sessions/${cash.id}`,
  )
  expect(updatedCash.expected_amount).toBe('1100.0100')
  await page.getByRole('button', { name: 'Nueva operación POS', exact: true }).click()
  await page.getByRole('button', { name: 'Ver pedido POS', exact: true }).click()
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  const tile = page
    .locator('.digital-table')
    .filter({ has: page.getByRole('button', { name: 'Seleccionar Mesa división', exact: true }) })
  await expect(tile).toContainText('Pagada · todavía ocupada')
  await tile.getByRole('button', { name: 'Liberar Mesa división', exact: true }).click()
  const release = page.getByRole('dialog', { name: 'Liberar mesa', exact: true })
  await expect(
    release.getByRole('heading', { name: '¿La mesa ya quedó desocupada?', exact: true }),
  ).toBeVisible()
  const releases: string[] = []
  await page.route(`**/api/v1/dining-sessions/${dining.id}/close`, async (route) => {
    releases.push(route.request().postData()!)
    const response = await route.fetch()
    if (releases.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await release.getByRole('button', { name: 'Sí, liberar mesa', exact: true }).click()
  await expect(
    release.getByRole('button', { name: 'Reintentar liberación', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(release).toBeVisible()
  await release.getByRole('button', { name: 'Reintentar liberación', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Ocupar Mesa división', exact: true }),
  ).toBeVisible()
  expect(releases).toHaveLength(2)
  expect(releases[0]).toBe(releases[1])
  expect(
    (await readApi<{ data: { status: string } }>(page, `dining-sessions/${dining.id}`)).data.status,
  ).toBe('closed')
  await page.locator('.pos-terminal').screenshot({ path: 'test-results/released-table.png' })
})
