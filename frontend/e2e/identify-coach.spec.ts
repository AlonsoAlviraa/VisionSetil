import { test, expect } from '@playwright/test'

/**
 * Identify coach smoke — PhotoCoach multi-view panel (UX-03).
 * Updated UX-08: guided wizard hosts `photo-coach-panel` (free mode is default).
 */
test.describe('Identify coach smoke', () => {
  test('identify page shows PhotoCoach panel in guided mode', async ({ page }) => {
    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('identify-mode-guided').click()
    await expect(page.getByTestId('identify-mode-guided')).toHaveAttribute('aria-pressed', 'true')

    await expect(page.getByTestId('photo-coach-panel')).toBeVisible({ timeout: 30_000 })
    // Orientation sticky (PageShell) — never product_unlock
    const text = await page.getByTestId('identify-page').innerText()
    expect(text).toMatch(/orientaci|nunca consumo|never consum/i)
  })

  test('guided multi-view wizard + coach wireframes', async ({ page }) => {
    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('identify-mode-guided').click()
    await expect(page.getByTestId('multi-view-wizard')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('photo-coach-panel')).toBeVisible()

    const toggle = page.getByTestId('photo-coach-toggle')
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await toggle.click()
    }
    await expect(page.getByTestId('photo-coach-body')).toBeVisible()
    await expect(page.locator('[data-testid^="photo-coach-wire-"]').first()).toBeVisible()
    await expect(page.getByTestId('photo-coach-edu-link')).toBeVisible()
  })
})
