/**
 * Launch mobile viewport matrix for Identify photo UX.
 * Playwright viewport profiles (no physical devices required).
 * Runs on app project by default; shells share IdentifyPage code path.
 */
import { test, expect, type Page, type Route } from '@playwright/test'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const ORIENTATION_RE =
  /orientaci|nunca\s+consumo|never.{0,24}consum|solo educaci|PERMISSION TO CONSUME|nunca recolecci/i
const FORAGE_FORBIDDEN_RE =
  /\bsafe to eat\b|puedes comer|excelente comestible|product_unlock\s*=\s*true/i

/**
 * Three viewport profiles: small / mid / large.
 * Descriptors aligned with common Playwright device sizes (no test.use device spread —
 * that forces workers and breaks nested describe).
 */
const VIEWPORTS = [
  {
    id: 'small',
    label: 'iPhone SE-like (small)',
    width: 375,
    height: 667,
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'mid',
    label: 'Pixel 5-like (mid)',
    width: 393,
    height: 851,
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'large',
    label: 'iPad Mini-like (large)',
    width: 768,
    height: 1024,
    isMobile: true,
    hasTouch: true,
  },
] as const

async function mockOnlineApis(page: Page) {
  await page.route('**/api/readyz', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ready: true,
        classifier_mode: 'mock',
        weights_present: true,
        quality_gate: { species_id_allowed: true, block_enabled: true },
        checks: { classifier_mode: 'mock' },
      }),
    })
  })
  await page.route('**/api/models/quality-gate', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        species_id_allowed: true,
        metrics_acceptable: false,
        block_enabled: true,
        verdict: 'UNACCEPTABLE',
      }),
    })
  })
  await page.route('**/api/health', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })
  // Vite proxies /models/* to :8000 — avoid cold-start ECONNREFUSED noise
  await page.route('**/models/status**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, mode: 'mock' }),
    })
  })
}

/** Cold Vite first paint can miss identify-page; retry with commit (faster than load). */
async function gotoIdentify(page: Page) {
  const root = page.getByTestId('identify-page')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto('/identificar', { waitUntil: 'commit', timeout: 45_000 })
      await expect(root).toBeVisible({ timeout: 25_000 })
      return
    } catch (err) {
      if (attempt === 2) throw err
      await page.waitForTimeout(500)
    }
  }
}

test.describe('Identify mobile viewport matrix', () => {
  // Cold Vite first paint is absorbed by retries (playwright.config) + gotoIdentify.
  for (const vp of VIEWPORTS) {
    test(`photo coach + upload + sticky CTA · ${vp.id} (${vp.label})`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await mockOnlineApis(page)
      await gotoIdentify(page)

      const body = await page.getByTestId('identify-page').innerText()
      expect(body).toMatch(ORIENTATION_RE)
      expect(body).not.toMatch(FORAGE_FORBIDDEN_RE)

      await page.getByTestId('identify-mode-guided').click()
      await expect(page.getByTestId('multi-view-wizard')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('photo-coach-panel')).toBeVisible()

      // Tap targets: camera/gallery CTAs ≥ ~36px height
      const galleryBtn = page.locator('.mv-add').first()
      await expect(galleryBtn).toBeVisible()
      const box = await galleryBtn.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(36)
      }

      const gallery = page.getByTestId('mv-gallery-input-gills')
      await expect(gallery).toBeAttached()
      expect(await gallery.getAttribute('capture')).toBeNull()

      await gallery.setInputFiles({
        name: `matrix-${vp.id}.png`,
        mimeType: 'image/png',
        buffer: TINY_PNG,
      })

      await expect(page.getByTestId('mv-preview-gills')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('identify-submit')).toBeVisible({ timeout: 15_000 })

      const sticky = page.locator('.analyze-actions').first()
      await expect(sticky).toBeVisible()
    })
  }
})
