/**
 * UX-08 / PR-18 — Learning-first dual-shell e2e matrix.
 *
 * Runs on Playwright projects `app` (:5173) and `web` (:5174).
 * No product_unlock, no live ML weights — orientation-only honesty via mocks.
 *
 * Covers:
 * 1. Games hub continue path + orientation sticky + honest share
 * 2. Identify PhotoCoach panel (zero-webp wireframes)
 * 3. Result hierarchy testids (mock accepted + open-set rejected)
 * 4. Shell chrome: app-shell + nav destinations shared by both shells
 */
import { test, expect, type Page, type Route } from '@playwright/test'

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Accent-safe: match stem so UTF-8 / NFC / mojibake of ó does not flake e2e.
const ORIENTATION_RE =
  /orientaci|nunca\s+consumo|never.{0,24}consum|solo educaci|PERMISSION TO CONSUME|nunca recolecci/i
const FORAGE_FORBIDDEN_RE =
  /\bsafe to eat\b|puedes comer|excelente comestible|permiso de recolecci|product_unlock\s*=\s*true/i

const MOCK_GATE = {
  species_id_allowed: true,
  metrics_acceptable: false,
  block_enabled: true,
  reason: 'demo mock stack — e2e learning-first',
  reason_code: 'no_metrics',
  test_map_at_3: null,
  safety_recall_deadly: null,
  min_map_at_3: 0.2,
  min_deadly_recall: 0.9,
  metrics_path: '/repo/eval/reports/missing_metrics.json',
  version: 'e2e-learning-first',
  verdict: 'UNACCEPTABLE' as const,
}

const MOCK_ACCEPTED = {
  request_id: 'e2e-lf-accepted',
  decision: 'accepted' as const,
  predictions: [
    {
      species: 'Boletus edulis',
      common_name: 'Boleto',
      confidence: 0.88,
      edibility: 'buen_comestible',
      slug: 'boletus-edulis',
      risk_level: 'edible_caution',
      in_catalog: true,
    },
    {
      species: 'Boletus aereus',
      common_name: null,
      confidence: 0.07,
      edibility: 'unknown',
      slug: 'boletus-aereus',
    },
    {
      species: 'Tylopilus felleus',
      common_name: null,
      confidence: 0.04,
      edibility: 'unknown',
      slug: 'tylopilus-felleus',
    },
  ],
  rejection_reason: null,
  processing_time_ms: 12,
  observation_id: null,
  safety_level: 'caution',
  missing_evidence: ['gills underside incomplete'],
  warnings: ['MOCK STACK: demo predictions — orientation only'],
  quality_warnings: [],
  dangerous_lookalikes: [],
  questions_for_user: ['¿Fotografiaste la base/volva?'],
  model_stack: {
    detector: 'none',
    visual_embedder: 'mock',
    image_text_embedder: 'mock',
    metadata_encoder: 'mock',
  },
  open_set_reason: null,
  recommend_human_review: true,
  final_warning:
    'Nunca comas una seta basándote solo en una app. Consulta a un experto.',
  confidence_margin: null,
  view_coverage: ['gills', 'front'],
  is_mock_stack: true,
  ml_notes: ['mock_stack_demo'],
  mode: 'mock' as const,
  quality_gate: MOCK_GATE,
  locale: 'es',
}

const MOCK_REJECTED = {
  ...MOCK_ACCEPTED,
  request_id: 'e2e-lf-rejected',
  decision: 'rejected' as const,
  rejection_reason: 'low_margin',
  open_set_reason: 'low_margin',
  predictions: [
    {
      species: 'Russula cyanoxantha',
      common_name: null,
      confidence: 0.31,
      edibility: 'unknown',
      slug: 'russula-cyanoxantha',
    },
  ],
  missing_evidence: ['front profile'],
  questions_for_user: [],
  dangerous_lookalikes: [],
}

/** Mock preflight + health so submit is not HARD-disabled offline (B-11). */
async function mockOnlineApis(page: Page, classifyPayload?: unknown) {
  await page.route('**/api/readyz', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ready: true,
        classifier_mode: 'mock',
        weights_present: true,
        quality_gate: MOCK_GATE,
        checks: { classifier_mode: 'mock', catalog_count: 520 },
      }),
    })
  })
  await page.route('**/api/models/quality-gate', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_GATE),
    })
  })
  await page.route('**/api/health', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })
  if (classifyPayload !== undefined) {
    await page.route('**/api/classify**', async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classifyPayload),
      })
    })
  }
}

async function enableGuidedWizard(page: Page) {
  const guided = page.getByTestId('identify-mode-guided')
  await expect(guided).toBeVisible({ timeout: 20_000 })
  await guided.click()
  await expect(guided).toHaveAttribute('aria-pressed', 'true')
}

async function uploadOneWizardImage(page: Page) {
  const fileInput = page.locator('input[type="file"]').first()
  await expect(fileInput).toBeAttached({ timeout: 15_000 })
  await fileInput.setInputFiles({
    name: 'gills-e2e-lf.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
}

/** Click analyze; if soft-confirm opens (weak packet), proceed. */
async function submitWithSoftConfirm(page: Page) {
  const submit = page.getByTestId('identify-submit')
  await expect(submit).toBeEnabled({ timeout: 20_000 })
  await submit.click()
  const proceed = page.getByTestId('identify-soft-confirm-proceed')
  try {
    await proceed.waitFor({ state: 'visible', timeout: 3_000 })
    await proceed.click()
  } catch {
    // Soft confirm not shown (packet already strong)
  }
}

test.describe('UX-08 learning-first dual-shell', () => {
  test('shell chrome: app-shell + shared learning destinations', async ({ page }, testInfo) => {
    await page.goto('/')
    const shell = page.getByTestId('app-shell')
    await expect(shell).toBeVisible({ timeout: 30_000 })
    // Forced layout mode baked by Vite target (app | web)
    const mode = await shell.getAttribute('data-layout-mode')
    if (testInfo.project.name === 'web') {
      expect(mode).toBe('web')
    } else {
      // app project: forced app, or legacy reactive default
      expect(mode === 'app' || mode === 'web').toBeTruthy()
    }

    // Shared nav destinations (navConfig SSOT) — bottom nav on app, header on web
    await page.goto('/juegos')
    await expect(page.getByTestId('games-hub-page')).toBeVisible({ timeout: 30_000 })
    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })
    await page.goto('/enciclopedia')
    await expect(page.locator('[data-testid="encyclopedia-page"], .page-encyclopedia, main').first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test('games hub: continue path + orientation + honest share (no product_unlock)', async ({
    page,
  }) => {
    await page.goto('/juegos')
    await expect(page.getByTestId('games-hub-page')).toBeVisible({ timeout: 30_000 })

    // Orientation rails: page body + sticky (PageShell) — accent-safe ORIENTATION_RE
    const pageText = await page.locator('body').innerText()
    expect(pageText).toMatch(ORIENTATION_RE)
    expect(pageText).not.toMatch(FORAGE_FORBIDDEN_RE)
    expect(pageText.toLowerCase()).not.toMatch(/product_unlock\s*=\s*true/)

    // Continue CTA + modes + share
    await expect(page.getByTestId('games-hub-primary-continue')).toBeVisible()
    await expect(page.getByTestId('games-daily-modes')).toBeVisible()
    await expect(page.getByTestId('games-hub-share')).toBeVisible()
    await expect(page.getByTestId('games-hub-identify-secondary')).toBeVisible()

    // Honest share via clipboard fallback when Web Share unavailable
    await page.evaluate(() => {
      // Force clipboard path in Chromium e2e
      // @ts-expect-error force undefined share for clipboard path
      delete navigator.share
    })
    let clipboardText = ''
    await page.exposeFunction('__e2eCaptureClipboard', (t: string) => {
      clipboardText = t
    })
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (t: string) => {
            // @ts-expect-error bridge
            await window.__e2eCaptureClipboard(t)
          },
        },
      })
    })

    await page.getByTestId('games-hub-share').click()
    // Feedback or silent success — wait briefly for async share
    await page.waitForTimeout(400)
    if (clipboardText) {
      expect(clipboardText).toMatch(/orientaci|orientation only/i)
      expect(clipboardText).toMatch(/nunca recolecci|nunca consumo|never forage|never consumption/i)
      expect(clipboardText).not.toMatch(FORAGE_FORBIDDEN_RE)
      expect(clipboardText.toLowerCase()).not.toContain('product_unlock')
    } else {
      // Share may report via in-page status without clipboard in some browsers
      const fb = page.getByTestId('games-hub-share-fb')
      if ((await fb.count()) > 0) {
        await expect(fb).toBeVisible()
      }
    }
  })

  test('identify: PhotoCoach panel + multi-view wizard (orientation only)', async ({ page }) => {
    await mockOnlineApis(page)
    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })

    // Free mode is default — PhotoCoach lives on guided multi-view wizard
    await enableGuidedWizard(page)

    await expect(page.getByTestId('multi-view-wizard')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('photo-coach-panel')).toBeVisible()

    // Expand coach — wireframes always present (zero webp)
    const toggle = page.getByTestId('photo-coach-toggle')
    await expect(toggle).toBeVisible()
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await toggle.click()
    }
    await expect(page.getByTestId('photo-coach-body')).toBeVisible()
    await expect(page.getByTestId('photo-coach-checklist')).toBeVisible()
    await expect(page.getByTestId('photo-coach-examples')).toBeVisible()
    // At least one CSS wire testid
    await expect(page.locator('[data-testid^="photo-coach-wire-"]').first()).toBeVisible()
    await expect(page.getByTestId('photo-coach-edu-link')).toBeVisible()

    const coachText = await page.getByTestId('photo-coach-panel').innerText()
    expect(coachText).toMatch(/orientaci|nunca|consumo|consumption|educaci/i)
    expect(coachText).not.toMatch(FORAGE_FORBIDDEN_RE)
  })

  test('result hierarchy: mock accepted ships safety → decision → topk testids', async ({
    page,
  }) => {
    await mockOnlineApis(page, MOCK_ACCEPTED)

    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })
    await enableGuidedWizard(page)
    await uploadOneWizardImage(page)
    await submitWithSoftConfirm(page)

    await expect(page.getByTestId('identify-result')).toBeVisible({ timeout: 30_000 })
    const card = page.getByTestId('result-card')
    await expect(card).toBeVisible()

    // Hierarchy SSOT testids (UX-02) — no product_unlock required
    await expect(page.getByTestId('result-orientation-sticky')).toBeVisible()
    await expect(page.getByTestId('decision-banner')).toBeVisible()
    await expect(page.getByTestId('predictions-list')).toBeVisible()
    await expect(page.getByTestId('prediction-item-0')).toBeVisible()
    // Mock mode honesty
    await expect(page.getByTestId('result-mode-banner')).toHaveAttribute('data-mode', 'mock')
    await expect(card).toHaveAttribute('data-show-confidence', 'false')

    const orient = await page.getByTestId('result-orientation-sticky').innerText()
    expect(orient).toMatch(ORIENTATION_RE)
    expect(orient).not.toMatch(FORAGE_FORBIDDEN_RE)

    // Education CTAs on identify result
    await expect(page.getByTestId('identify-result-lookalikes')).toBeVisible()
    await expect(page.getByTestId('identify-result-edu')).toBeVisible()
  })

  test('result hierarchy: open-set rejected shows decision-reject-reason', async ({ page }) => {
    await mockOnlineApis(page, MOCK_REJECTED)

    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })
    await enableGuidedWizard(page)
    await uploadOneWizardImage(page)
    await submitWithSoftConfirm(page)

    await expect(page.getByTestId('identify-result')).toBeVisible({ timeout: 30_000 })
    const banner = page.getByTestId('decision-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-decision', 'rejected')
    await expect(page.getByTestId('decision-reject-reason')).toBeVisible()
    await expect(page.getByTestId('result-orientation-sticky')).toBeVisible()

    // Rejected must not celebrate edible clearance
    const body = await page.getByTestId('identify-result').innerText()
    expect(body).not.toMatch(FORAGE_FORBIDDEN_RE)
    expect(body.toLowerCase()).not.toMatch(/¡excelente!|safe to eat/)
  })
})
