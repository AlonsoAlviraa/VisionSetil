/**
 * B-48 — Playwright blocked-mode honesty smoke.
 *
 * Asserts Identify fail-closed UX when the quality gate blocks species ID:
 * - result-mode-banner data-mode=blocked
 * - educational blocked shell (no fake top-k)
 * - no FoodQualityChip / food-q-chip chrome
 * - no consumption-permission phrases
 *
 * Mocks /api/readyz, /api/models/quality-gate, and POST /api/classify so the
 * suite does not need a live backend or weights (deps B-08 + B-11).
 */
import { test, expect, type Page, type Route } from '@playwright/test'

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const BLOCKED_GATE = {
  species_id_allowed: false,
  metrics_acceptable: false,
  block_enabled: true,
  reason: 'no_metrics: missing sibling metrics for loaded checkpoint',
  reason_code: 'no_metrics',
  test_map_at_3: null,
  safety_recall_deadly: null,
  min_map_at_3: 0.2,
  min_deadly_recall: 0.9,
  metrics_path: '/repo/eval/reports/missing_metrics.json',
  version: 'e2e-blocked',
  verdict: 'UNACCEPTABLE' as const,
}

/** Honest blocked classify payload: empty predictions, mode=blocked. */
const BLOCKED_CLASSIFY = {
  request_id: 'e2e-blocked-req-1',
  decision: 'rejected' as const,
  predictions: [] as [],
  rejection_reason: 'model_quality_gate',
  processing_time_ms: 12,
  observation_id: null,
  safety_level: 'warning',
  missing_evidence: [],
  warnings: ['QUALITY GATE: species identification blocked'],
  quality_warnings: [],
  dangerous_lookalikes: [],
  questions_for_user: [],
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
  view_coverage: ['gills'],
  is_mock_stack: false,
  ml_notes: ['quality_gate_blocked'],
  mode: 'blocked' as const,
  quality_gate: BLOCKED_GATE,
  locale: 'es',
}

const CONSUMPTION_FORBIDDEN = [
  /safe to eat/i,
  /seguro para comer/i,
  /apto para el consumo/i,
  /puedes consumir/i,
  /comestible seguro/i,
  /safe for consumption/i,
]

async function mockHonestyApis(page: Page) {
  await page.route('**/api/readyz', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ready: true,
        classifier_mode: 'real',
        weights_present: true,
        quality_gate: BLOCKED_GATE,
        checks: {
          classifier_mode: 'real',
          catalog_count: 520,
        },
      }),
    })
  })

  await page.route('**/api/models/quality-gate', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(BLOCKED_GATE),
    })
  })

  await page.route('**/api/classify**', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(BLOCKED_CLASSIFY),
    })
  })

  // Health probes used elsewhere should not hang
  await page.route('**/api/health', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })
}

async function uploadOneWizardImage(page: Page) {
  const fileInput = page.locator('input[type="file"]').first()
  await expect(fileInput).toBeAttached({ timeout: 15_000 })
  await fileInput.setInputFiles({
    name: 'gills-e2e.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
}

test.describe('Identify blocked-mode honesty', () => {
  test('blocked classify: banner + educational shell, no fake species, no food chip', async ({
    page,
  }) => {
    await mockHonestyApis(page)

    await page.goto('/identificar')

    // Preflight may show blocked advisory; submit must stay enabled (B-11 HARD)
    const preflight = page.getByTestId('preflight-banner')
    await expect(preflight).toBeVisible({ timeout: 30_000 })
    await expect(preflight).toHaveAttribute('data-mode', 'blocked')
    await expect(preflight).toHaveAttribute('data-submit-enabled', 'true')

    await uploadOneWizardImage(page)

    const submit = page.getByTestId('identify-submit')
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()

    await expect(page.getByTestId('identify-result')).toBeVisible({
      timeout: 30_000,
    })

    const banner = page.getByTestId('result-mode-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-mode', 'blocked')
    await expect(page.getByTestId('result-mode-chip')).toHaveText('blocked')

    const card = page.getByTestId('result-card')
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-mode', 'blocked')
    await expect(card).toHaveAttribute('data-show-confidence', 'false')

    // Educational shell — no fake top-k species list
    await expect(page.getByTestId('educational-blocked-shell')).toBeVisible()
    await expect(page.getByTestId('educational-blocked-title')).toBeVisible()
    await expect(page.getByTestId('educational-blocked-body')).toBeVisible()
    await expect(page.getByTestId('cta-encyclopedia')).toBeVisible()
    await expect(page.getByTestId('cta-education')).toBeVisible()
    await expect(page.getByTestId('cta-expert')).toBeVisible()

    await expect(page.getByTestId('predictions-list')).toHaveCount(0)
    await expect(page.getByTestId('prediction-item-0')).toHaveCount(0)
    await expect(page.getByTestId('confidence-bar')).toHaveCount(0)

    // D-B16: no FoodQualityChip on Identify (class food-q-chip)
    await expect(page.locator('.food-q-chip')).toHaveCount(0)
    await expect(page.locator('[class*="food-q-chip"]')).toHaveCount(0)

    // No invented species names from empty predictions
    const resultText = (await page.getByTestId('identify-result').innerText()) || ''
    expect(resultText).not.toMatch(/Boletus edulis/i)
    expect(resultText).not.toMatch(/Amanita muscaria/i)

    for (const re of CONSUMPTION_FORBIDDEN) {
      expect(resultText).not.toMatch(re)
    }
  })

  test('blocked mode never shows FoodQualityChip even if UI re-renders', async ({
    page,
  }) => {
    await mockHonestyApis(page)
    await page.goto('/identificar')
    await expect(page.getByTestId('preflight-banner')).toBeVisible({
      timeout: 30_000,
    })

    await uploadOneWizardImage(page)
    await page.getByTestId('identify-submit').click()
    await expect(page.getByTestId('result-mode-banner')).toHaveAttribute(
      'data-mode',
      'blocked',
      { timeout: 30_000 },
    )

    // Stay on result a beat; chip must not appear
    await page.waitForTimeout(300)
    await expect(page.locator('.food-q-chip')).toHaveCount(0)
    await expect(page.getByTestId('educational-blocked-shell')).toBeVisible()
  })
})
