import { test, expect } from '@playwright/test'

test.describe('Media reliability smoke', () => {
  test('encyclopedia cards render species images', async ({ page }) => {
    await page.goto('/enciclopedia')
    await expect(page.getByTestId('encyclopedia-count')).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => {
        const text = (await page.getByTestId('encyclopedia-count').textContent()) || '0'
        return parseInt(text.replace(/[^\d]/g, ''), 10) || 0
      })
      .toBeGreaterThanOrEqual(319)

    const images = page.getByTestId('species-image')
    await expect(images.first()).toBeVisible({ timeout: 15_000 })
    // At least one loaded image without error stage=inline only
    const count = await images.count()
    expect(count).toBeGreaterThan(0)
  })

  test('static media endpoint serves webp from the browser', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const r = await fetch('/media/species/amanita-phalloides/card.webp')
      const buf = new Uint8Array(await r.arrayBuffer())
      const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3])
      return { status: r.status, magic, len: buf.length }
    })
    expect(result.status).toBe(200)
    expect(result.magic).toBe('RIFF')
    expect(result.len).toBeGreaterThan(1000)
  })
})
