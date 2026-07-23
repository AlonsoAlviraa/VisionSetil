import { test, expect } from '@playwright/test'

/**
 * C-45: Season radar renders via pack path without full catalog hang.
 */
test.describe('Season radar pack path', () => {
  test('home shows season strip without waiting full catalog', async ({ page }) => {
    // Block the heavy catalog snapshot chunk if requested as a separate dynamic import.
    // Pack path uses static import; this ensures we still paint if catalog is slow/blocked.
    await page.route('**/species_catalog_snapshot.json', (route) => {
      // Delay full catalog heavily — season must not depend on it
      setTimeout(() => {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 2, species: [], count: 0 }),
        })
      }, 15_000)
    })

    await page.goto('/')
    const season = page.getByTestId('season-radar')
    await expect(season).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('season-radar-list')).toBeVisible()
    await expect(page.getByTestId('season-disclaimer')).toBeVisible()

    const listCount = await page.locator('[data-testid="season-radar-list"] li').count()
    expect(listCount).toBeGreaterThanOrEqual(3)

    const ready = await page.evaluate(() => {
      const marks = performance.getEntriesByName('season-radar-ready')
      return {
        markCount: marks.length,
        pack: document.querySelector('[data-testid="season-radar"]')?.getAttribute('data-pack'),
        ready: document.querySelector('[data-testid="season-radar"]')?.getAttribute('data-ready'),
      }
    })
    expect(ready.pack).toBe('1')
    expect(ready.ready).toBe('1')
    expect(ready.markCount).toBeGreaterThanOrEqual(1)

    // Disclaimer: educational, no harvest permission
    const disc = (await page.getByTestId('season-disclaimer').textContent()) || ''
    expect(disc.toLowerCase()).toMatch(/educativ|recolecci|consumo/)
    expect(disc.toLowerCase()).not.toMatch(/permiso de recolectar garantizado/)
  })

  test('season list has image thumbs or skeletons (no hang empty)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('season-radar')).toBeVisible({ timeout: 10_000 })
    const thumbs = page.locator('[data-testid="season-radar-list"] [data-testid="species-image"]')
    await expect(thumbs.first()).toBeVisible({ timeout: 10_000 })
    const n = await thumbs.count()
    expect(n).toBeGreaterThanOrEqual(3)
  })
})
