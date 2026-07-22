/**
 * B-49 — Playwright mock mode banner smoke.
 *
 * Asserts Identify honesty UX when the backend serves demo/mock stack results:
 * - result-mode-banner data-mode=mock (demo banner visible)
 * - chip + i18n title for mock mode
 * - demo predictions may render; confidence stays hidden (D-B9 / D-B13)
 * - educational blocked shell must NOT appear
 *
 * Mocks POST /api/classify (+ health) so the suite does not need a live backend
 * or real weights (deps B-08 only).
 */
import { test, expect, type Page, type Route } from '@playwright/test'

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Gate can pass species ID in mock; metrics still not field-grade. */
const MOCK_GATE = {
  species_id_allowed: true,
  metrics_acceptable: false,
  block_enabled: true,
  reason: 'demo mock stack — no field weights',
  reason_code: 'no_metrics',
  test_map_at_3: null,
  safety_recall_deadly: null,
  min_map_at_3: 0.2,
  min_deadly_recall: 0.9,
  metrics_path: '/repo/eval/reports/missing_metrics.json',
  version: 'e2e-mock',
  verdict: 'UNACCEPTABLE' as const,
}

/** Honest mock classify payload: demo preds + mode=mock (D-B13). */
const MOCK_CLASSIFY = {
  request_id: 'e2e-mock-req-1',
  decision: 'accepted' as const,
  predictions: [
    {
      species: 'Boletus edulis',
      common_name: 'Boleto comestible',
      confidence: 0.91,
      edibility: 'buen_comestible',
      slug: 'boletus-edulis',
      risk_level: 'edible_caution',
      in_catalog: true,
    },
  ],
  rejection_reason: null,
  processing_time_ms: 8,
  observation_id: null,
  safety_level: 'caution',
  missing_evidence: [],
  warnings: ['MOCK STACK: demo predictions only — not field identification'],
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
  is_mock_stack: true,
  ml_notes: ['mock_stack_demo'],
  mode: 'mock' as const,
  quality_gate: MOCK_GATE,
  locale: 'es',
}

async function mockMockModeApis(page: Page) {
  await page.route('**/api/classify**', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CLASSIFY),
    })
  })

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
    name: 'gills-e2e-mock.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
}

test.describe('Identify mock-mode demo banner', () => {
  test('mock classify: demo banner visible (data-mode=mock)', async ({ page }) => {
    await mockMockModeApis(page)

    await page.goto('/identificar')
    await expect(page.getByTestId('identify-coach').or(page.locator('h1'))).toBeVisible({
      timeout: 30_000,
    })

    await uploadOneWizardImage(page)

    // B-08 branch: no identify-submit testid yet — use visible Analizar CTA
    const submit = page.getByRole('button', { name: /Analizar/i })
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()

    await expect(page.getByTestId('identify-result')).toBeVisible({
      timeout: 30_000,
    })

    const banner = page.getByTestId('result-mode-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-mode', 'mock')
    await expect(page.getByTestId('result-mode-chip')).toHaveText('mock')

    // Demo banner copy (ES default): honesty.mode.mock
    const title = page.getByTestId('result-mode-banner-title')
    await expect(title).toBeVisible()
    await expect(title).toContainText(/demo|mock|sin pesos/i)

    const card = page.getByTestId('result-card')
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-mode', 'mock')
    // D-B9: confidence only for real + metrics_acceptable
    await expect(card).toHaveAttribute('data-show-confidence', 'false')

    // Mock is not blocked — educational shell must stay hidden
    await expect(page.getByTestId('educational-blocked-shell')).toHaveCount(0)

    // Demo predictions allowed under mock labeling (D-B13)
    await expect(page.getByTestId('predictions-list')).toBeVisible()
    await expect(page.getByTestId('prediction-item-0')).toBeVisible()
    await expect(page.getByTestId('confidence-bar')).toHaveCount(0)
  })
})
