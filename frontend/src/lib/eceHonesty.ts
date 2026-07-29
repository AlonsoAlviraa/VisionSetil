/**
 * ECE residual honesty (M2/M2.1) — pure FE mirror of kaggle/ml_qa/ece_honesty.py.
 * Advisory only · never product_unlock · never forage/consumption.
 *
 * Soft MAP/deadly gates can PASS while ECE stays high (E20 ≈0.188).
 * Identify confidence chrome must follow ECE residual, not only metrics_acceptable.
 */

export type EceBand = 'good' | 'moderate' | 'high' | 'unknown'

export const ECE_GOOD_MAX = 0.05
export const ECE_MODERATE_MAX = 0.12

/**
 * Published E20 source-holdout residual (metrics.json test_ece).
 * Used when live `/models/status.ece_residual` is unavailable.
 * product_unlock always false.
 */
export const E20_ECE_SNAPSHOT = {
  test_ece: 0.18781378849301697,
  band: 'high' as EceBand,
  product_unlock: false as const,
  protocol: 'source_holdout_e20',
}

export function classifyEceBand(ece: number | null | undefined): EceBand {
  if (ece == null || !Number.isFinite(ece) || ece < 0) return 'unknown'
  if (ece < ECE_GOOD_MAX) return 'good'
  if (ece < ECE_MODERATE_MAX) return 'moderate'
  return 'high'
}

export type EceGuidance = {
  showConfidence: boolean
  deemphasizeConfidence: boolean
  summaryEs: string
  summaryEn: string
}

export function eceProductGuidance(band: EceBand): EceGuidance {
  switch (band) {
    case 'good':
      return {
        showConfidence: true,
        deemphasizeConfidence: false,
        summaryEs:
          'ECE bajo: confianza usable con cautela · sigue sin permiso de consumo.',
        summaryEn:
          'Low ECE: confidence usable with caution · still never consumption permission.',
      }
    case 'moderate':
      return {
        showConfidence: true,
        deemphasizeConfidence: true,
        summaryEs:
          'ECE moderado: de-enfatizar % en UI · open-set y multi-vista mandan.',
        summaryEn:
          'Moderate ECE: de-emphasize % in UI · open-set and multi-view lead.',
      }
    case 'high':
      return {
        showConfidence: false,
        deemphasizeConfidence: true,
        summaryEs:
          'ECE alto (residual): no confiar en % del modelo. Abstención open-set + multi-vista + revisión humana. Nunca permiso de consumo.',
        summaryEn:
          'High ECE residual: do not trust model %. Open-set abstain + multi-view + human review. Never consumption permission.',
      }
    default:
      return {
        showConfidence: false,
        deemphasizeConfidence: true,
        summaryEs:
          'ECE desconocido: fail-closed — no mostrar confianza como certeza.',
        summaryEn:
          'Unknown ECE: fail-closed — do not show confidence as certainty.',
      }
  }
}

/**
 * Combine dual-signal gate (shouldShowConfidence) with ECE residual.
 * ECE can only tighten chrome further — never unlocks confidence when gate hides it.
 * Never product_unlock / never edible clearance.
 */
export function resolveIdentifyConfidenceChrome(
  gateAllowsConfidence: boolean,
  eceBand: EceBand = E20_ECE_SNAPSHOT.band,
): {
  show: boolean
  deemphasize: boolean
  hideNumericPercent: boolean
  band: EceBand
  noteEs: string
  noteEn: string
  productUnlock: false
} {
  const g = eceProductGuidance(eceBand)
  // Gate + ECE both required for full bars; high/unknown force hide
  const show = Boolean(gateAllowsConfidence && g.showConfidence)
  const deemphasize = !show || g.deemphasizeConfidence
  const hideNumericPercent =
    !show || eceBand === 'high' || eceBand === 'unknown' || deemphasize
  return {
    show,
    deemphasize,
    hideNumericPercent,
    band: eceBand,
    noteEs: g.summaryEs,
    noteEn: g.summaryEn,
    productUnlock: false,
  }
}

/** Short sticky line for ResultCard / Identify (locale-aware). */
export function eceConfidenceStickyLine(
  band: EceBand = E20_ECE_SNAPSHOT.band,
  locale?: string,
): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const g = eceProductGuidance(band)
  return en ? g.summaryEn : g.summaryEs
}

/** Normalize API ece_residual block for dashboard. */
export function normalizeEceResidual(raw: unknown): {
  band: EceBand
  ece: number | null
  summary: string
  productUnlock: false
  status: string
  source: 'live' | 'snapshot' | 'unknown'
} {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ece =
    typeof o.test_ece === 'number'
      ? o.test_ece
      : typeof o.ece === 'number'
        ? o.ece
        : null
  const bandFromApi = String(o.band || '')
  const hasLive =
    bandFromApi === 'good' ||
    bandFromApi === 'moderate' ||
    bandFromApi === 'high' ||
    bandFromApi === 'unknown' ||
    ece != null
  const band: EceBand =
    bandFromApi === 'good' ||
    bandFromApi === 'moderate' ||
    bandFromApi === 'high' ||
    bandFromApi === 'unknown'
      ? bandFromApi
      : classifyEceBand(ece)
  const g = eceProductGuidance(band)
  const guidance = o.guidance as Record<string, unknown> | undefined
  const summary =
    (typeof guidance?.summary_es === 'string' && guidance.summary_es) ||
    (typeof guidance?.summary_en === 'string' && guidance.summary_en) ||
    g.summaryEs
  return {
    band,
    ece,
    summary,
    productUnlock: false,
    status: String(o.status || 'unknown'),
    source: hasLive ? 'live' : 'unknown',
  }
}

/**
 * Extract ECE band from full `/models/status` JSON (or partial).
 * Fail-soft: returns E20 snapshot band when missing — never unlocks.
 */
export function eceBandFromModelsStatus(status: unknown): {
  band: EceBand
  ece: number | null
  source: 'live' | 'snapshot'
  productUnlock: false
} {
  const root = (status && typeof status === 'object' ? status : {}) as Record<
    string,
    unknown
  >
  const residual = root.ece_residual
  const summary = (root.summary && typeof root.summary === 'object'
    ? root.summary
    : {}) as Record<string, unknown>

  if (residual && typeof residual === 'object') {
    const n = normalizeEceResidual(residual)
    if (n.status !== 'unavailable' && n.band !== 'unknown') {
      return {
        band: n.band,
        ece: n.ece,
        source: 'live',
        productUnlock: false,
      }
    }
    // unknown band but has numeric ece
    if (n.ece != null) {
      return {
        band: classifyEceBand(n.ece),
        ece: n.ece,
        source: 'live',
        productUnlock: false,
      }
    }
  }

  const sumEce =
    typeof summary.ece === 'number'
      ? summary.ece
      : typeof summary.test_ece === 'number'
        ? summary.test_ece
        : null
  const sumBand = String(summary.ece_band || '')
  if (
    sumBand === 'good' ||
    sumBand === 'moderate' ||
    sumBand === 'high' ||
    sumBand === 'unknown'
  ) {
    return {
      band: sumBand,
      ece: sumEce,
      source: 'live',
      productUnlock: false,
    }
  }
  if (sumEce != null) {
    return {
      band: classifyEceBand(sumEce),
      ece: sumEce,
      source: 'live',
      productUnlock: false,
    }
  }

  return {
    band: E20_ECE_SNAPSHOT.band,
    ece: E20_ECE_SNAPSHOT.test_ece,
    source: 'snapshot',
    productUnlock: false,
  }
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

/** In-memory cache for Identify session (avoid hammering /models/status). */
let _eceBandCache: {
  band: EceBand
  ece: number | null
  source: 'live' | 'snapshot'
  fetchedAt: number
} | null = null

export const ECE_BAND_CACHE_TTL_MS = 60_000

/**
 * Live fetch of ECE residual band for Identify confidence chrome.
 * Fail-soft → E20 snapshot (high). Never product_unlock.
 */
export async function fetchEceBandForIdentify(
  signal?: AbortSignal,
): Promise<{
  band: EceBand
  ece: number | null
  source: 'live' | 'snapshot'
  productUnlock: false
}> {
  const now = Date.now()
  if (
    _eceBandCache &&
    now - _eceBandCache.fetchedAt < ECE_BAND_CACHE_TTL_MS
  ) {
    return {
      band: _eceBandCache.band,
      ece: _eceBandCache.ece,
      source: _eceBandCache.source,
      productUnlock: false,
    }
  }

  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (API_KEY) headers['X-API-Key'] = API_KEY
    const res = await fetch(`${API_BASE.replace(/\/$/, '')}/models/status`, {
      method: 'GET',
      signal,
      headers,
    })
    if (!res.ok) {
      return {
        band: E20_ECE_SNAPSHOT.band,
        ece: E20_ECE_SNAPSHOT.test_ece,
        source: 'snapshot',
        productUnlock: false,
      }
    }
    const data = await res.json()
    const parsed = eceBandFromModelsStatus(data)
    _eceBandCache = {
      band: parsed.band,
      ece: parsed.ece,
      source: parsed.source,
      fetchedAt: now,
    }
    return {
      band: parsed.band,
      ece: parsed.ece,
      source: parsed.source,
      productUnlock: false,
    }
  } catch {
    return {
      band: E20_ECE_SNAPSHOT.band,
      ece: E20_ECE_SNAPSHOT.test_ece,
      source: 'snapshot',
      productUnlock: false,
    }
  }
}

/** Test helper: clear session cache. */
export function clearEceBandCache(): void {
  _eceBandCache = null
}
