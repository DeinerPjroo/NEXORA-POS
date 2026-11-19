import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Terminal: mesas reales por salón, ocupación y separación de Admin', async ({ page }) => {
  await fixtureWorkspace(page, 'Terminal operativo')
  const context = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: context.branches[0].id,
    name: 'Principal operativo',
    color: '#7255db',
    is_active: true,
  })
  await writeApi(page, 'POST', `dining-rooms/${room.id}/tables`, {
    idempotency_key: crypto.randomUUID(),
    room_revision: 1,
    name: 'Mesa operativa',
    shape: 'square',
    color: '#258ca7',
    capacity: 4,
    is_active: true,
  })
  await page.goto('/terminal/mesas')
  const terminal = page.locator('[data-environment="terminal"]')
  await expect(terminal).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Ocupar Mesa operativa', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.dining-occupancy-card[data-state="available"]')).toContainText(
    'Libre',
  )
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(
    terminal.getByRole('button', { name: 'Bloquear pantalla', exact: true }),
  ).toBeVisible()
  await terminal.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page.locator('[data-environment="terminal"]')).toHaveCount(0)
  await expect(page.locator('.sidebar')).toBeVisible()
})
