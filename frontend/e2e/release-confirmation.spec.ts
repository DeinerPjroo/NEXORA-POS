import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('Liberar mesa: confirmación centrada y amplia, No conserva y Sí libera', async ({ page }) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(20_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Confirmación de mesa')
  const { branches } = await readApi<{ branches: { id: number }[] }>(page, 'operations/context')
  const branch = branches[0].id
  const { data: room } = await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    name: 'Salón',
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
      name: 'Mesa 1',
      shape: 'square',
      capacity: 4,
      color: '#7258df',
      is_active: true,
    },
  )
  const { data: session } = await writeApi<{ data: { id: number } }>(
    page,
    'POST',
    'dining-sessions',
    {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      guest_count: 2,
      waiter_id: null,
      notes: '',
      tables: [{ id: table.id, revision: table.revision }],
    },
  )
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Mesas', exact: true }).click()
  await page.getByRole('button', { name: 'Liberar Mesa 1', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Liberar mesa', exact: true })
  await expect(
    dialog.getByRole('heading', { name: '¿La mesa ya quedó desocupada?', exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      dialog.evaluate((node) => {
        const r = node.getBoundingClientRect()
        return (
          r.width >= 550 &&
          Math.abs(r.x + r.width / 2 - innerWidth / 2) <= 2 &&
          Math.abs(r.y + r.height / 2 - innerHeight / 2) <= 2
        )
      }),
    )
    .toBe(true)
  await page.screenshot({ path: 'test-results/release-confirmation-desktop.png' })
  await dialog.getByRole('button', { name: 'No, volver', exact: true }).click()
  expect(
    (await readApi<{ data: { status: string } }>(page, `dining-sessions/${session.id}`)).data
      .status,
  ).toBe('open')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Liberar Mesa 1', exact: true }).click()
  await expect
    .poll(() =>
      dialog.evaluate((node) => {
        const r = node.getBoundingClientRect()
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          Math.abs(r.y + r.height / 2 - innerHeight / 2) <= 2
        )
      }),
    )
    .toBe(true)
  await page.screenshot({ path: 'test-results/release-confirmation-mobile.png' })
  await dialog.getByRole('button', { name: 'Sí, liberar mesa', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ocupar Mesa 1', exact: true })).toBeVisible()
})
