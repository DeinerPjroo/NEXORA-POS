import { test, expect } from '@playwright/test'
import { fixtureWorkspace, writeApi } from './helpers'

test('POS: categorías digitales y nombres visibles con fotos activadas y desactivadas', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixtureWorkspace(page, 'Menú digital')
  for (const [index, name] of ['Pizzas', 'Bebidas'].entries()) {
    const category = await writeApi<{ id: number }>(page, 'POST', 'categories', {
      name,
      color: index ? '#168d85' : '#7255db',
      is_active: true,
    })
    await writeApi(page, 'POST', 'products', {
      name: index ? 'Jugo de maracuyá' : 'Pizza pollo y champiñones',
      sku: `DIGITAL-${index}`,
      category_id: category.id,
      sale_price: index ? '9000' : '42000',
      currency: 'COP',
      is_active: true,
      is_available: true,
    })
  }
  await page.goto('/pos')
  const pizza = page.getByRole('button', { name: 'Agregar Pizza pollo y champiñones', exact: true })
  const juice = page.getByRole('button', { name: 'Agregar Jugo de maracuyá', exact: true })
  const photos = page.getByRole('button', { name: 'Mostrar fotografías', exact: true })
  const categories = page.getByRole('navigation', { name: 'Categorías del terminal' })
  await expect(pizza).toBeVisible()
  for (const mode of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, mode)
    for (const enabled of [false, true, false]) {
      if ((await photos.getAttribute('aria-pressed')) !== String(enabled)) await photos.click()
      await expect(pizza.locator('strong')).toHaveText('Pizza pollo y champiñones')
      await expect(pizza.locator('.order-product-image')).toBeVisible({ visible: enabled })
      // El nombre debe caber dentro del botón: toBeVisible por sí solo no detecta recortes.
      await expect
        .poll(async () =>
          pizza.evaluate((button) => {
            const title = button.querySelector('strong')!.getBoundingClientRect()
            const price = button.lastElementChild!.getBoundingClientRect()
            const bounds = button.getBoundingClientRect()
            return (
              title.height >= 25 &&
              title.top >= bounds.top &&
              title.bottom <= price.top &&
              price.bottom <= bounds.bottom
            )
          }),
        )
        .toBe(true)
    }
    await categories.getByRole('button', { name: 'Pizzas', exact: true }).click()
    await expect(categories.getByRole('button', { name: 'Pizzas', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(pizza).toBeVisible()
    await expect(juice).toHaveCount(0)
    await categories.getByRole('button', { name: 'Todos', exact: true }).click()
    await expect(juice).toBeVisible()
  }
  await expect(pizza).toHaveCSS('height', '100px')
  await page.screenshot({ path: 'test-results/pos-digital-menu.png' })
})
