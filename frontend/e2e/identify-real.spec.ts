/**
 * B-50 — Playwright real identify path (conditional skip).
 *
 * Live integration smoke for Identify mode=real. Does **not** mock classify;
 * probes the backend quality gate and **skips** unless both:
 *   - weights_present === true
 *   - quality_gate.metrics_acceptable === true
 *
 * Default CI / local without packaged field weights + acceptable metrics will
 * skip (not fail). Run with a live FastAPI (port 8000, Vite /api proxy) and
 * a checkpoint that passes the gate to exercise this path.
 *
 * Deps: B-48 (blocked honesty e2e patterns) + B-08/B-11 UI testids.
 */
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test'

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const CONSUMPTION_FORBIDDEN = [
  /safe to eat/i,
  /seguro para comer/i,
  /apto para el consumo/i,
  /puedes consumir/i,
  /comestible seguro/i,
  /safe for consumption/i,
]

type RealGateProbe = {
  pass: boolean
  reason: string
  weights_present?: boolean
  metrics_acceptable?: boolean
  species_id_allowed?: boolean
  classifier_mode?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

/**
 * Probe live /api/readyz (+ optional /api/models/quality-gate) for the B-50
 * run gate: weights present AND metrics_acceptable.
 */
async function probeRealGatePass(
  request: APIRequestContext,
): Promise<RealGateProbe> {
  let readyzBody: Record<string, unknown> | null = null
  try {
    const res = await request.get('/api/readyz', { timeout: 8_000 })
    if (!res.ok()) {
      return {
        pass: false,
        reason: `readyz HTTP ${res.status()} — backend down or not proxied`,
      }
    }
    readyzBody = asRecord(await res.json())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      pass: false,
      reason: `api unreachable (${msg}) — need live FastAPI on :8000`,
    }
  }

  if (!readyzBody) {
    return { pass: false, reason: 'readyz empty body' }
  }

  const weightsPresent = readyzBody.weights_present === true
  let metricsAcceptable: boolean | undefined
  let speciesIdAllowed: boolean | undefined

  const nested = asRecord(readyzBody.quality_gate)
  if (nested) {
    if (typeof nested.metrics_acceptable === 'boolean') {
      metricsAcceptable = nested.metrics_acceptable
    }
    if (typeof nested.species_id_allowed === 'boolean') {
      speciesIdAllowed = nested.species_id_allowed
    }
  }

  // Fallback dedicated endpoint when nested gate missing (partial deploy)
  if (metricsAcceptable === undefined) {
    try {
      const gateRes = await request.get('/api/models/quality-gate', {
        timeout: 8_000,
      })
      if (gateRes.ok()) {
        const gateBody = asRecord(await gateRes.json())
        if (gateBody && typeof gateBody.metrics_acceptable === 'boolean') {
          metricsAcceptable = gateBody.metrics_acceptable
        }
        if (gateBody && typeof gateBody.species_id_allowed === 'boolean') {
          speciesIdAllowed = gateBody.species_id_allowed
        }
      }
    } catch {
      // ignore — handled as missing metrics below
    }
  }

  const classifierMode =
    typeof readyzBody.classifier_mode === 'string'
      ? readyzBody.classifier_mode
      : undefined

  if (!weightsPresent) {
    return {
      pass: false,
      reason: 'weights_present=false (no field checkpoint on disk)',
      weights_present: false,
      metrics_acceptable: metricsAcceptable,
      species_id_allowed: speciesIdAllowed,
      classifier_mode: classifierMode,
    }
  }

  if (metricsAcceptable !== true) {
    return {
      pass: false,
      reason: `metrics_acceptable=${String(metricsAcceptable)} (gate not pass)`,
      weights_present: true,
      metrics_acceptable: metricsAcceptable,
      species_id_allowed: speciesIdAllowed,
      classifier_mode: classifierMode,
    }
  }

  return {
    pass: true,
    reason: 'weights_present + metrics_acceptable',
    weights_present: true,
    metrics_acceptable: true,
    species_id_allowed: speciesIdAllowed,
    classifier_mode: classifierMode,
  }
}

async function uploadOneWizardImage(page: Page) {
  const fileInput = page.locator('input[type="file"]').first()
  await expect(fileInput).toBeAttached({ timeout: 15_000 })
  await fileInput.setInputFiles({
    name: 'gills-e2e-real.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
}

test.describe('Identify real-mode path (conditional)', () => {
  test('real classify: mode banner + confidence when weights+metrics pass', async ({
    page,
    request,
  }) => {
    const probe = await probeRealGatePass(request)
    test.skip(
      !probe.pass,
      `real identify path skip without gate pass: ${probe.reason}`,
    )

    // Live path — no route mocks for readyz/classify
    await page.goto('/identificar')

    // Preflight advisory should report real when stack + gate allow
    const preflight = page.getByTestId('preflight-banner')
    await expect(preflight).toBeVisible({ timeout: 30_000 })
    // When species ID is allowed under acceptable metrics, preflight mode is real
    // (if policy still blocks for other reasons, we would not have metrics_acceptable)
    await expect(preflight).toHaveAttribute('data-mode', /real|unknown/)
    await expect(preflight).toHaveAttribute('data-submit-enabled', 'true')

    await uploadOneWizardImage(page)

    const submit = page.getByTestId('identify-submit')
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()

    // Real ML may be slower than mocked paths
    await expect(page.getByTestId('identify-result')).toBeVisible({
      timeout: 120_000,
    })

    const banner = page.getByTestId('result-mode-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-mode', 'real')
    await expect(page.getByTestId('result-mode-chip')).toHaveText('real')

    const card = page.getByTestId('result-card')
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-mode', 'real')
    // D-B9: confidence UI only when real + metrics_acceptable (gate we required)
    await expect(card).toHaveAttribute('data-show-confidence', 'true')

    // Real path is not gate-blocked — educational shell must stay hidden
    await expect(page.getByTestId('educational-blocked-shell')).toHaveCount(0)

    // D-B16: still no FoodQualityChip on Identify
    await expect(page.locator('.food-q-chip')).toHaveCount(0)
    await expect(page.locator('[class*="food-q-chip"]')).toHaveCount(0)

    const resultText =
      (await page.getByTestId('identify-result').innerText()) || ''
    for (const re of CONSUMPTION_FORBIDDEN) {
      expect(resultText).not.toMatch(re)
    }
  })
})
