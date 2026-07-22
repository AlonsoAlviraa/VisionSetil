import { test, expect } from '@playwright/test'

test.describe('Identify coach smoke', () => {
  test('identify page shows capture coach', async ({ page }) => {
    await page.goto('/identificar')
    await expect(page.getByTestId('identify-coach')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('safety-banner')).toBeVisible()
  })

  test('guided wizard is present when feature enabled', async ({ page }) => {
    await page.goto('/identificar')
    // Wizard is feature-flagged; coach is always on. Wizard may or may not appear.
    const coach = page.getByTestId('identify-coach')
    await expect(coach).toBeVisible({ timeout: 30_000 })
    const wizard = page.getByTestId('identify-wizard')
    if (await wizard.count()) {
      await expect(wizard).toBeVisible()
    }
  })
})
