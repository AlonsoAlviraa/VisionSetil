import { test, expect } from '@playwright/test'

/**
 * D1 SSOT: home + encyclopedia counters must be ≥ 520
 * (species_catalog_v2 / species_catalog_snapshot).
 * Wait until async catalog snapshot hydrates (count leaves 0).
 */
const SSOT_MIN = 520

async function waitForCount(locator: import('@playwright/test').Locator, min = SSOT_MIN) {
  await expect(locator).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => {
      const text = (await locator.textContent())?.trim() || '0'
      return parseInt(text.replace(/[^\d]/g, ''), 10) || 0
    }, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(min)
}

test.describe('Catalog count smoke', () => {
  test('home species count is at least 520 (SSOT)', async ({ page }) => {
    await page.goto('/')
    await waitForCount(page.getByTestId('home-species-count'), SSOT_MIN)
  })

  test('encyclopedia count is at least 520 (SSOT)', async ({ page }) => {
    await page.goto('/enciclopedia')
    await waitForCount(page.getByTestId('encyclopedia-count'), SSOT_MIN)
  })
})
