import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'
import type { CommercialReport } from '../src/features/dashboard/types'
import { formatMoney } from '../src/lib/money'

test('Studio Dashboard: widgets reales, orden, publicación y preferencias sin cambiar dinero', async ({
  page,
}) => {
  test.setTimeout(100_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await fixtureWorkspace(page, 'Studio Dashboard')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7255db',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Menú Studio',
      sku: 'STUDIO-DASH',
      category_id: category.id,
      sale_price: '100.01',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Sin impuesto',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  const cash = (
    await writeApi<{ data: { id: number; revision: number } }>(
      page,
      'POST',
      `cash/registers/${register.id}/open`,
      { idempotency_key: crypto.randomUUID(), opening_amount: '0', currency: 'COP' },
    )
  ).data
  const order = (
    await writeApi<{ data: { id: number; revision: number } }>(page, 'POST', 'orders', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      channel: 'takeaway',
      currency: 'COP',
      items: [
        { product_id: product.id, product_revision: 1, quantity: 1, expected_unit_price: '100.01' },
      ],
    })
  ).data
  await writeApi(page, 'POST', `orders/${order.id}/collect`, {
    idempotency_key: crypto.randomUUID(),
    cash_session_id: cash.id,
    cash_revision: cash.revision,
    order_revision: order.revision,
    settings_revision: 2,
    discount_amount: '0',
    expected_total: '100.01',
    received_amount: '100.01',
  })
  const before = (await readApi<{ data: CommercialReport }>(page, 'workspace/commercial-dashboard'))
    .data
  const cashBefore = (
    await readApi<{ data: { revision: number } }>(page, `cash/sessions/${cash.id}`)
  ).data.revision
  const preferences = () =>
    page.evaluate(() =>
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('nexora:dashboard:'))
        .map((key) => [key, sessionStorage.getItem(key)]),
    )
  const preferencesBefore = await preferences()
  await page.goto('/admin/studio/dashboard')
  const editor = page.getByRole('region', { name: 'Editor de Dashboard' })
  const preview = page.frameLocator('iframe')
  const metric = preview
    .locator('.commercial-metric')
    .filter({ has: preview.getByText('Ventas registradas', { exact: true }) })
  await expect(metric).toContainText(formatMoney('100.01'))
  await expect(preview.locator('.commercial-as-of')).toContainText(
    'Vista previa sin actualización automática',
  )
  await editor.getByRole('button', { name: 'Dashboard Compacto', exact: true }).click()
  await editor.getByRole('checkbox', { name: 'Métodos de pago', exact: true }).uncheck()
  await editor.getByRole('button', { name: 'Subir Operación actual', exact: true }).click()
  await expect(preview.locator('[data-studio-widget="live"]')).toHaveCSS('order', '0')
  await expect(preview.locator('[data-studio-widget="methods"]')).toHaveCount(0)
  expect(await preferences()).toEqual(preferencesBefore)
  expect(
    (await readApi<{ data: { revision: number } }>(page, 'studio/dashboard/active')).data.revision,
  ).toBe(0)
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 2')
  await page.goto('/inicio')
  const dashboard = page.locator('.commercial-dashboard')
  await expect(dashboard).toHaveAttribute('data-studio-dashboard', 'true')
  await expect(dashboard.locator('[data-studio-widget="live"]')).toHaveCSS('order', '0')
  const live = await dashboard.locator('[data-studio-widget="live"]').boundingBox()
  const totals = await dashboard.locator('[data-studio-widget="totals"]').boundingBox()
  expect(live!.y).toBeLessThan(totals!.y)
  await expect(dashboard.locator('[data-studio-widget="methods"]')).toHaveCount(0)
  await expect(
    dashboard
      .locator('.commercial-metric')
      .filter({ has: page.getByText('Ventas registradas', { exact: true }) }),
  ).toContainText(formatMoney('100.01'))
  const after = (await readApi<{ data: CommercialReport }>(page, 'workspace/commercial-dashboard'))
    .data
  expect(after.sales).toEqual(before.sales)
  expect(after.cash_expenses).toEqual(before.cash_expenses)
  expect(
    (await readApi<{ data: { revision: number } }>(page, `cash/sessions/${cash.id}`)).data.revision,
  ).toBe(cashBefore)
  await dashboard.getByText('Personalizar esta vista', { exact: true }).click()
  await expect(
    dashboard.getByRole('checkbox', { name: 'Métodos de pago', exact: true }),
  ).toBeDisabled()
  await dashboard.getByRole('checkbox', { name: 'Gráfico diario', exact: true }).uncheck()
  await page.reload()
  await expect(dashboard.locator('[data-studio-widget="chart"]')).toHaveCount(0)
  await expect(dashboard.locator('[data-studio-widget="methods"]')).toHaveCount(0)
})

test('Studio Dashboard: habilitar widgets no expone finanzas a un diseñador sin permisos', async ({
  page,
}) => {
  await fixtureWorkspace(page, 'Studio lectura limitada', [
    'dashboard.view',
    'studio.view',
    'studio.edit',
    'studio.publish',
  ])
  await page.goto('/admin/studio/dashboard')
  const editor = page.getByRole('region', { name: 'Editor de Dashboard' })
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('.commercial-dashboard')).toContainText(
    'Tu acceso al resumen no incluye indicadores de ventas ni caja',
  )
  await expect(preview.locator('.commercial-metric')).toHaveCount(0)
  await editor.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Publicar diseño', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Publicar diseño', exact: true }).click()
  await expect(editor).toContainText('Publicado 2')
  await page.goto('/inicio')
  await expect(page.locator('.commercial-dashboard')).toHaveAttribute(
    'data-studio-dashboard',
    'true',
  )
  await expect(page.locator('.commercial-metric')).toHaveCount(0)
  const report = (await readApi<{ data: CommercialReport }>(page, 'workspace/commercial-dashboard'))
    .data
  expect(report.sales).toBeNull()
  expect(report.cash_expenses).toBeNull()
})
