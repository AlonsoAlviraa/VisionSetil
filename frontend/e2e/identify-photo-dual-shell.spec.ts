/**
 * Launch readiness — identify photo upload parity on app (:5173) + web (:5174).
 *
 * Shared UploadZone / MultiViewWizard / IdentifyPage path. No product_unlock.
 * Proves gallery pick loads a preview and sticky analyze CTA is present.
 */
import { test, expect, type Page, type Route } from '@playwright/test'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Accent-safe stems (ó can flake under some console encodings)
const ORIENTATION_RE =
  /orientaci|nunca\s+consumo|never.{0,24}consum|solo educaci|PERMISSION TO CONSUME|nunca recolecci/i
const FORAGE_FORBIDDEN_RE =
  /\bsafe to eat\b|puedes comer|excelente comestible|permiso de recolecci|product_unlock\s*=\s*true/i

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
        checks: { classifier_mode: 'mock', catalog_count: 520 },
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
        reason: 'e2e photo parity',
        reason_code: 'no_metrics',
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
  await page.route('**/models/status**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, mode: 'mock' }),
    })
  })
}

/** Cold Vite first paint can miss identify-page; retry with commit. */
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

test.describe('Identify photo dual-shell parity', () => {
  test('guided wizard gallery upload shows preview on both shells', async ({ page }, testInfo) => {
    await mockOnlineApis(page)
    await gotoIdentify(page)

    const shell = page.getByTestId('app-shell')
    await expect(shell).toBeVisible()
    const mode = await shell.getAttribute('data-layout-mode')
    if (testInfo.project.name === 'web') {
      expect(mode).toBe('web')
    } else {
      expect(mode === 'app' || mode === 'web').toBeTruthy()
    }

    const pageText = await page.getByTestId('identify-page').innerText()
    expect(pageText).toMatch(ORIENTATION_RE)
    expect(pageText).not.toMatch(FORAGE_FORBIDDEN_RE)

    // Guided multi-view path (PhotoCoach + slots)
    await page.getByTestId('identify-mode-guided').click()
    await expect(page.getByTestId('identify-mode-guided')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('multi-view-wizard')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('photo-coach-panel')).toBeVisible()

    // Gallery input must exist and must NOT force capture (app mobile library)
    const gallery = page.getByTestId('mv-gallery-input-gills')
    await expect(gallery).toBeAttached({ timeout: 10_000 })
    const captureAttr = await gallery.getAttribute('capture')
    expect(captureAttr).toBeNull()

    await gallery.setInputFiles({
      name: 'gills-dual-shell.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })

    // Preview paints (eager loading) — parity lock for app shell
    await expect(page.getByTestId('mv-preview-gills')).toBeVisible({ timeout: 15_000 })
    const src = await page.getByTestId('mv-preview-gills').getAttribute('src')
    expect(src).toBeTruthy()
    expect(src!).toMatch(/^(blob:|data:)/)

    // Sticky analyze CTA above bottom nav chrome
    await expect(page.getByTestId('identify-submit')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.analyze-actions.sticky-analyze, .analyze-actions--wizard').first()).toBeVisible()
  })

  test('free mode dropzone upload shows preview', async ({ page }) => {
    await mockOnlineApis(page)
    await gotoIdentify(page)

    // Free mode is default, but force it
    await page.getByTestId('identify-mode-free').click()
    await expect(page.getByTestId('identify-mode-free')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('upload-dropzone')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('upload-open-camera')).toBeVisible()

    const fileInput = page.locator('[data-testid="upload-dropzone"] input[type="file"], input[type="file"]').first()
    await expect(fileInput).toBeAttached({ timeout: 10_000 })
    await fileInput.setInputFiles({
      name: 'free-dual-shell.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })

    await expect(page.getByTestId('identify-free-capture')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('identify-free-preview-0')).toBeVisible({ timeout: 15_000 })
    const src = await page.getByTestId('identify-free-preview-0').getAttribute('src')
    expect(src).toBeTruthy()
    expect(src!).toMatch(/^(blob:|data:)/)

    await expect(page.getByTestId('identify-submit')).toBeVisible()
  })
})
