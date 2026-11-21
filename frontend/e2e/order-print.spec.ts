import { test, expect } from '@playwright/test'
import { fixtureWorkspace, readApi, writeApi } from './helpers'

test('El bloqueo de pantalla retira la copia imprimible y conserva el borrador al desbloquear', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { password } = await fixtureWorkspace(page, 'Impresión protegida')
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7258df',
    is_active: true,
  })
  await writeApi(page, 'POST', 'products', {
    name: 'Pizza protegida',
    sku: 'PRINT-LOCK',
    category_id: category.id,
    sale_price: '18000',
    currency: 'COP',
    is_active: true,
    is_available: true,
  })
  await page.goto('/terminal/domicilios/nuevo')
  await page.getByRole('button', { name: 'Agregar Pizza protegida', exact: true }).click()
  await page.getByRole('button', { name: 'Imprimir borrador', exact: true }).click()
  await expect(page.locator('.operational-print-root')).toHaveCount(1)
  await writeApi(page, 'POST', 'auth/screen/lock', {})
  await page.evaluate(() => window.dispatchEvent(new Event('nexora:screen-changed')))
  const lock = page.getByRole('dialog', { name: 'Pantalla bloqueada', exact: true })
  await expect(lock).toBeVisible()
  await expect(page.locator('.operational-print-root')).toHaveCount(0)
  await lock.getByLabel('Tu contraseña', { exact: true }).fill(password)
  await lock.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await expect(lock).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'Imprimir borrador', exact: true })).toContainText(
    'Pizza protegida',
  )
  await expect(page.locator('.operational-print-root')).toHaveCount(1)
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(0)
})

test('Borradores y comandas de mesa, recogida y domicilio imprimen solo el documento sin reenviar', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await fixtureWorkspace(page, 'Impresión restaurante')
  const branch = (await readApi<{ branches: { id: number }[] }>(page, 'operations/context'))
    .branches[0].id
  const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
    name: 'Carta',
    color: '#7258df',
    is_active: true,
  })
  const product = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'products', {
      name: 'Pizza impresión',
      sku: 'PRINT',
      category_id: category.id,
      sale_price: '18000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  ).data
  const station = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'kitchen-stations', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Pizzas',
      color: '#7258df',
      target_minutes: 12,
      is_active: true,
    })
  ).data
  await writeApi(page, 'POST', 'kitchen-routes', {
    idempotency_key: crypto.randomUUID(),
    branch_id: branch,
    product_id: product.id,
    product_revision: 1,
    kitchen_station_id: station.id,
    is_active: true,
  })
  const channels = ['dine_in', 'takeaway', 'delivery'] as const
  const room = (
    await writeApi<{ data: { id: number } }>(page, 'POST', 'dining-rooms', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      name: 'Salón prueba',
      color: '#F5F7FB',
      is_active: true,
    })
  ).data
  const table = (
    await writeApi<{ data: { id: number; revision: number } }>(
      page,
      'POST',
      `dining-rooms/${room.id}/tables`,
      {
        idempotency_key: crypto.randomUUID(),
        room_revision: 1,
        name: 'Mesa 7',
        shape: 'circle',
        color: '#DCD6FF',
        capacity: 4,
        is_active: true,
      },
    )
  ).data
  const attention = (
    await writeApi<{ data: { id: number; revision: number } }>(page, 'POST', 'dining-sessions', {
      idempotency_key: crypto.randomUUID(),
      branch_id: branch,
      tables: [{ id: table.id, revision: table.revision }],
      guest_count: 2,
      waiter_id: null,
    })
  ).data
  for (const channel of channels) {
    const order = (
      await writeApi<{ data: { id: number; revision: number } }>(page, 'POST', 'orders', {
        idempotency_key: crypto.randomUUID(),
        branch_id: branch,
        channel,
        currency: 'COP',
        customer_name: `Cliente ${channel}`,
        notes: 'Salsa aparte',
        ...(channel === 'dine_in'
          ? { dining_session_id: attention.id, dining_session_revision: attention.revision }
          : {}),
        ...(channel === 'delivery'
          ? {
              delivery: {
                recipient_name: 'Ana destinataria',
                phone: '3001234567',
                address: 'Calle de prueba 10',
              },
            }
          : {}),
        items: [
          {
            product_id: product.id,
            product_revision: 2,
            quantity: 2,
            expected_unit_price: '18000',
            notes: 'Sin cebolla',
            preparation_destination: channel === 'dine_in' ? 'table' : 'takeaway',
          },
        ],
      })
    ).data
    await page.goto(`/pedidos/${order.id}`)
    await page.getByRole('button', { name: 'Imprimir comanda', exact: true }).click()
    const picker = page.getByRole('dialog', { name: `Comandas · Pedido #${order.id}` })
    await expect(picker).toContainText('Todavía no hay comandas')
    await picker.getByRole('button', { name: 'Cerrar', exact: true }).click()
    const dispatch = (
      await writeApi<{ data: { tickets: { id: number }[] } }>(
        page,
        'POST',
        `orders/${order.id}/kitchen-dispatch`,
        { idempotency_key: crypto.randomUUID(), order_revision: order.revision },
      )
    ).data
    await page.getByRole('button', { name: 'Imprimir borrador', exact: true }).click()
    const draft = page.getByRole('dialog', { name: 'Imprimir borrador', exact: true })
    await expect(draft).toContainText(`Cliente ${channel}`)
    if (channel === 'dine_in') await expect(draft).toContainText('Mesa 7')
    await expect(draft).toContainText('36.000')
    await expect(draft).toContainText('NO ES FACTURA NI COMPROBANTE DE PAGO')
    await draft.getByLabel('Ancho de papel').selectOption('58')
    await expect(draft.locator('.operational-ticket')).toHaveAttribute('data-width', '58')
    await draft.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.getByRole('button', { name: 'Imprimir comanda', exact: true }).click()
    await picker
      .getByRole('button', { name: `Imprimir comanda #${dispatch.tickets[0].id}`, exact: true })
      .click()
    const preview = page.getByRole('dialog', { name: 'Imprimir comanda', exact: true })
    await expect(preview).toContainText('Sin cebolla')
    await expect(preview).toContainText(`Cliente ${channel}`)
    await expect(preview).toContainText('Salsa aparte')
    await expect(preview).toContainText(
      channel === 'dine_in' ? 'SERVIR EN MESA' : 'EMPACAR · PARA LLEVAR',
    )
    await expect(preview).not.toContainText('36.000')
    await page.evaluate(() => {
      window.print = () => {
        document.body.dataset.printRequested = 'yes'
      }
    })
    await preview.getByRole('button', { name: 'Abrir impresión', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-print-requested', 'yes')
    if (channel === 'takeaway') {
      await page.screenshot({ path: 'test-results/order-print-preview.png' })
      await page.emulateMedia({ media: 'print' })
      await expect(page.locator('.operational-print-root')).toBeVisible()
      await expect(page.locator('#root')).toBeHidden()
      await expect(page.locator('.operational-print-root')).toContainText(`Pedido #${order.id}`)
      await page.screenshot({ path: 'test-results/order-print-paper.png' })
      const pdf = await page.pdf({
        path: 'test-results/kitchen-ticket.pdf',
        width: '80mm',
        printBackground: true,
      })
      expect(pdf.length).toBeGreaterThan(1000)
      await page.emulateMedia({ media: 'screen' })
    }
    await preview.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await picker.getByRole('button', { name: 'Cerrar', exact: true }).click()
    const history = await readApi<{ data: unknown[] }>(page, `orders/${order.id}/kitchen-tickets`)
    expect(history.data).toHaveLength(1)
  }
  await writeApi(page, 'PUT', 'sales/settings', {
    revision: 1,
    confirmed: true,
    tax_mode: 'none',
    tax_name: 'Prueba',
    tax_rate: '0',
  })
  const register = (await readApi<{ data: { id: number }[] }>(page, 'cash/registers')).data[0]
  await writeApi(page, 'POST', `cash/registers/${register.id}/open`, {
    idempotency_key: crypto.randomUUID(),
    opening_amount: '0',
    currency: 'COP',
  })
  await page.goto('/terminal/recogidas')
  await page.getByRole('button', { name: 'Nueva recogida', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar Pizza impresión', exact: true }).click()
  await page.getByRole('button', { name: 'Imprimir borrador', exact: true }).click()
  const pending = page.getByRole('dialog', { name: 'Imprimir borrador', exact: true })
  await expect(pending).toContainText('INCLUYE PRODUCTOS SIN GUARDAR')
  await expect(pending).toContainText('18.000')
  expect((await readApi<{ data: unknown[] }>(page, 'orders')).data).toHaveLength(3)
})
