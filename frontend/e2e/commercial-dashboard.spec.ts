import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import { formatMoney } from '../src/lib/money'
import { localMinute } from '../src/features/dining/reservation-time'

test('Dashboard: apertura, pedido POS, cobro, devolución, egreso y cierre con indicadores reales', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await fixtureWorkspace(page, 'Dashboard Nexora')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#8271FF',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Menú comercial',
    sku: 'COMERCIAL',
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
  const register = (
    await readApi<{ data: { id: number; branch_id: number }[] }>(page, 'cash/registers')
  ).data.find((register) => register.branch_id === branch)!.id
  const cash = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'cash/registers/' + register + '/open', {
      idempotency_key: crypto.randomUUID(),
      opening_amount: '1000',
      currency: 'COP',
    })
  ).data
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Agregar Menú comercial', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar al cobro', exact: true }).click()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('150')
  await page.getByRole('button', { name: 'Confirmar cobro en efectivo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recibo V-000001', exact: true })).toBeVisible()
  const saleId = Number(page.url().split('/').at(-1))
  const sale = (
    await readApi<{ data: { revision: number; payments: { id: number }[] } }>(
      page,
      'sales/' + saleId,
    )
  ).data
  let cashRevision = (
    await readApi<{ data: { revision: number } }>(page, 'cash/sessions/' + cash.id)
  ).data.revision
  await writeApi(page, 'POST', 'sales/' + saleId + '/refunds', {
    idempotency_key: crypto.randomUUID(),
    sale_revision: sale.revision,
    expected_refundable: '100.01',
    cash_session_id: cash.id,
    cash_revision: cashRevision,
    reason: 'Compensación parcial de prueba',
    refunds: [{ payment_id: sale.payments[0].id, amount: '10' }],
  })
  cashRevision = (await readApi<{ data: { revision: number } }>(page, 'cash/sessions/' + cash.id))
    .data.revision
  await writeApi(page, 'POST', 'cash/sessions/' + cash.id + '/movements', {
    idempotency_key: crypto.randomUUID(),
    revision: cashRevision,
    type: 'expense',
    amount: '7',
    reason: 'Egreso manual de prueba',
  })
  await page.goto('/caja/sesiones/' + cash.id)
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await page.getByLabel('Efectivo contado al cierre', { exact: true }).fill('1083.01')
  await page.getByRole('button', { name: 'Confirmar cierre', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Cierre registrado. Los movimientos se conservan.',
      exact: true,
    }),
  ).toBeVisible()
  const other = await writeApi<{ id: number }>(page, 'POST', 'branches', {
    name: 'Segunda sede',
    code: 'SEGUNDA',
    is_active: true,
  })
  await page.goto('/inicio')
  await page.getByRole('button', { name: 'Actualizar métricas', exact: true }).click()
  const card = (label: string) =>
    page.locator('.commercial-metric').filter({ has: page.getByText(label, { exact: true }) })
  await expect(card('Ventas registradas')).toContainText(formatMoney('100.01'))
  await expect(card('Cobros aplicados')).toContainText(formatMoney('100.01'))
  await expect(card('Devoluciones registradas')).toContainText(formatMoney('10'))
  await expect(card('Neto de cobros')).toContainText(formatMoney('90.01'))
  await expect(card('Egresos manuales de caja')).toContainText(formatMoney('7'))
  await expect(page.getByRole('link', { name: '0 Cajas abiertas', exact: true })).toBeVisible()
  const today = localMinute(Date.now(), 'America/Bogota').slice(0, 10)
  await page.getByLabel('Día del gráfico', { exact: true }).selectOption(today)
  await page.getByLabel('Medida del gráfico', { exact: true }).selectOption('net_paid_amount')
  await expect(page.locator('.commercial-day-detail')).toContainText(formatMoney('90.01'))
  await page.getByRole('button', { name: 'Consultar este día', exact: true }).click()
  await expect(page.getByLabel('Desde', { exact: true })).toHaveValue(today)
  await expect(page.getByLabel('Hasta', { exact: true })).toHaveValue(today)
  await expect(page.getByRole('button', { name: 'Consultar periodo', exact: true })).toBeEnabled()
  await page.getByLabel('Sucursal del dashboard', { exact: true }).selectOption(String(other.id))
  await page.getByRole('button', { name: 'Consultar periodo', exact: true }).click()
  await expect(card('Ventas registradas')).toContainText(formatMoney('0'))
  await page.getByLabel('Sucursal del dashboard', { exact: true }).selectOption('')
  await page.getByRole('button', { name: 'Consultar periodo', exact: true }).click()
  await expect(card('Neto de cobros')).toContainText(formatMoney('90.01'))
  await page.getByText('Personalizar esta vista', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Métodos de pago', exact: true }).uncheck()
  await expect(page.getByRole('heading', { name: 'Métodos registrados', exact: true })).toHaveCount(
    0,
  )
  await page.reload()
  await expect(card('Neto de cobros')).toContainText(formatMoney('90.01'))
  await expect(page.getByRole('heading', { name: 'Métodos registrados', exact: true })).toHaveCount(
    0,
  )
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('nexora:dashboard:'))!
    sessionStorage.setItem(key, JSON.stringify(['constructor']))
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Métodos registrados', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Productos registrados en ventas', exact: true }),
  ).toBeVisible()
  mkdirSync('../docs/screenshots', { recursive: true })
  await page.locator('.commercial-dashboard').screenshot({
    path: '../docs/screenshots/commercial-dashboard-desktop.png',
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.commercial-dashboard').screenshot({
    path: '../docs/screenshots/commercial-dashboard-mobile.png',
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Dashboard: resumen básico no consulta ni muestra importes sin permisos de ventas y caja', async ({
  page,
}) => {
  await fixtureWorkspace(page, 'Acceso básico', ['dashboard.view'])
  await expect(page.getByRole('heading', { name: 'Resumen comercial', exact: true })).toBeVisible()
  await expect(
    page.getByText('Tu acceso al resumen no incluye indicadores de ventas ni caja.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(page.locator('.commercial-metric')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Evolución del periodo', exact: true }),
  ).toHaveCount(0)
  const response = await readApi<{
    data: {
      sales: unknown
      cash_expenses: unknown
      live: { orders_active: unknown; tables_occupied: unknown; cash_sessions_open: unknown }
    }
  }>(page, 'workspace/commercial-dashboard')
  expect(response.data.sales).toBeNull()
  expect(response.data.cash_expenses).toBeNull()
  expect(Object.values(response.data.live).every((v) => v === null)).toBe(true)
})
