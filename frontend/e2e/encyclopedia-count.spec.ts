import { test, expect } from '@playwright/test'

/**
 * Catalog scale smoke: home + encyclopedia counters must be ≥ 319
 * (compatible with 500+ after GBIF expansion).
 * Wait until async catalog snapshot hydrates (count leaves 0).
 */
async function waitForCount(locator: import('@playwright/test').Locator, min = 319) {
  await expect(locator).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => {
      const text = (await locator.textContent())?.trim() || '0'
      return parseInt(text.replace(/[^\d]/g, ''), 10) || 0
    }, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(min)
}

test.describe('Catalog count smoke', () => {
  test('home species count is at least 319', async ({ page }) => {
    await page.goto('/')
    await waitForCount(page.getByTestId('home-species-count'), 319)
  })

  test('encyclopedia count is at least 319', async ({ page }) => {
    await page.goto('/enciclopedia')
    await waitForCount(page.getByTestId('encyclopedia-count'), 319)
  })
})
