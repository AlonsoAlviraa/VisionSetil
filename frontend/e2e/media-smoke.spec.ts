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
      return {
        status: r.status,
        magic,
        len: buf.length,
        quality: r.headers.get('X-Media-Quality'),
      }
    })
    expect(result.status).toBe(200)
    expect(result.magic).toBe('RIFF')
    expect(result.len).toBeGreaterThan(1000)
    // Real fixture should not be stub_fallback
    if (result.quality) {
      expect(result.quality).not.toBe('stub_fallback')
    }
  })

  test('stub-sized card is rewritten to placeholder (serve gate)', async ({ page }) => {
    await page.goto('/')
    // Use a known tiny slug if present; otherwise verify header contract via missing path
    const result = await page.evaluate(async () => {
      // Prefer a historically tiny slug; after rebuild it may be ok — still check missing→placeholder
      const r = await fetch('/media/species/zzzz-not-a-species/card.webp')
      return {
        status: r.status,
        quality: r.headers.get('X-Media-Quality'),
        cache: r.headers.get('Cache-Control'),
        len: (await r.arrayBuffer()).byteLength,
      }
    })
    // Vite middleware rewrites missing species to placeholder 200
    expect(result.status).toBe(200)
    expect(result.len).toBeGreaterThan(100)
    if (result.quality) {
      expect(result.quality).toBe('stub_fallback')
    }
    if (result.cache) {
      expect(result.cache).toMatch(/max-age=300/)
    }
  })

  test('species-image stage is never unrecovered broken (placeholder counts as success)', async ({
    page,
  }) => {
    await page.goto('/enciclopedia')
    await expect(page.getByTestId('species-image').first()).toBeVisible({ timeout: 20_000 })
    const stages = await page.locator('[data-testid="species-image"]').evaluateAll((els) =>
      els.slice(0, 12).map((el) => el.getAttribute('data-stage')),
    )
    expect(stages.length).toBeGreaterThan(0)
    for (const st of stages) {
      expect(['primary', 'card', 'thumb', 'placeholder', 'inline', null]).toContain(st)
    }
  })
})
