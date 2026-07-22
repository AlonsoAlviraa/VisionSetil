/**
 * Identify preflight (B-11 / Phase B Appendix D.1).
 *
 * Fetches /readyz (+ nested quality_gate) and /models/quality-gate,
 * maps PreflightMode, and decides submit enablement.
 *
 * HARD: submit disabled ONLY when offline/API-down — never for gate blocked.
 */

import type { QualityGatePayload, QualityGateReasonCode } from '../api/types'
import { isQualityGatePayload } from './classifyMode'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

/** Poll interval on Identify (design: mount + 60s). */
export const PREFLIGHT_POLL_MS = 60_000

export type PreflightMode = 'real' | 'mock' | 'blocked' | 'offline' | 'unknown'

export type PreflightState = {
  mode: PreflightMode
  ready: boolean
  classifier_mode?: string
  species_id_allowed?: boolean
  metrics_acceptable?: boolean
  block_enabled?: boolean
  gate_reason?: string
  reason_code?: string
  map_at_3?: number | null
  deadly_recall?: number | null
  catalog_count?: number
  weights_present?: boolean
  /** True when metrics are bad under real/mock (gate disabled / advisory). */
  metrics_warning: boolean
  /** HARD: false only when mode === 'offline'. Gate blocked never disables. */
  submit_enabled: boolean
  fetched_at: number
  loading: boolean
  error?: string
}

export type MapPreflightInput = {
  /** True when API could not be reached (network / both endpoints failed). */
  offline: boolean
  ready?: boolean
  classifier_mode?: string | null
  species_id_allowed?: boolean | null
  metrics_acceptable?: boolean | null
  block_enabled?: boolean | null
  gate_reason?: string | null
  reason_code?: string | null
  map_at_3?: number | null
  deadly_recall?: number | null
  catalog_count?: number | null
  weights_present?: boolean | null
  fetched_at?: number
  loading?: boolean
  error?: string
}

const PREFLIGHT_MODES: readonly PreflightMode[] = [
  'real',
  'mock',
  'blocked',
  'offline',
  'unknown',
] as const

export function isPreflightMode(value: unknown): value is PreflightMode {
  return (
    typeof value === 'string' &&
    (PREFLIGHT_MODES as readonly string[]).includes(value)
  )
}

function isMockClassifier(mode: string | null | undefined): boolean {
  if (!mode) return false
  const m = mode.toLowerCase()
  return m === 'mock' || m.includes('mock')
}

function isRealClassifier(mode: string | null | undefined): boolean {
  if (!mode) return false
  const m = mode.toLowerCase()
  return m === 'real' || (m.includes('real') && !m.includes('mock'))
}

/**
 * Normative PreflightMode mapping (Appendix D.1).
 *
 * Priority:
 * 1. offline → offline (submit disabled)
 * 2. species_id_allowed === false → blocked (submit enabled)
 * 3–4. allowed + mock → mock (+ metrics_warning if !metrics_acceptable)
 * 5–6. allowed + real → real (+ metrics_warning if !metrics_acceptable)
 * 7. else → unknown (submit enabled if online)
 */
export function mapPreflightMode(
  input: MapPreflightInput,
): Pick<PreflightState, 'mode' | 'metrics_warning' | 'submit_enabled'> {
  if (input.offline) {
    return { mode: 'offline', metrics_warning: false, submit_enabled: false }
  }

  if (input.species_id_allowed === false) {
    return { mode: 'blocked', metrics_warning: false, submit_enabled: true }
  }

  const metricsWarning = input.metrics_acceptable === false
  const allowed = input.species_id_allowed === true
  const classifier = input.classifier_mode

  if (allowed && isMockClassifier(classifier)) {
    return {
      mode: 'mock',
      metrics_warning: metricsWarning,
      submit_enabled: true,
    }
  }

  if (allowed && isRealClassifier(classifier)) {
    return {
      mode: 'real',
      metrics_warning: metricsWarning,
      submit_enabled: true,
    }
  }

  // Gate missing dual signal but stack truth available — still advisory honesty.
  if (input.species_id_allowed == null) {
    if (isMockClassifier(classifier)) {
      return {
        mode: 'mock',
        metrics_warning: metricsWarning,
        submit_enabled: true,
      }
    }
    if (isRealClassifier(classifier)) {
      return {
        mode: 'real',
        metrics_warning: metricsWarning,
        submit_enabled: true,
      }
    }
  }

  return { mode: 'unknown', metrics_warning: false, submit_enabled: true }
}

/** Build full PreflightState from raw inputs (pure / testable). */
export function buildPreflightState(input: MapPreflightInput): PreflightState {
  const mapped = mapPreflightMode(input)
  return {
    mode: mapped.mode,
    ready: input.ready === true,
    classifier_mode: input.classifier_mode ?? undefined,
    species_id_allowed:
      typeof input.species_id_allowed === 'boolean'
        ? input.species_id_allowed
        : undefined,
    metrics_acceptable:
      typeof input.metrics_acceptable === 'boolean'
        ? input.metrics_acceptable
        : undefined,
    block_enabled:
      typeof input.block_enabled === 'boolean' ? input.block_enabled : undefined,
    gate_reason: input.gate_reason ?? undefined,
    reason_code: input.reason_code ?? undefined,
    map_at_3: input.map_at_3 ?? null,
    deadly_recall: input.deadly_recall ?? null,
    catalog_count:
      typeof input.catalog_count === 'number' ? input.catalog_count : undefined,
    weights_present:
      typeof input.weights_present === 'boolean'
        ? input.weights_present
        : undefined,
    metrics_warning: mapped.metrics_warning,
    submit_enabled: mapped.submit_enabled,
    fetched_at: input.fetched_at ?? Date.now(),
    loading: input.loading === true,
    error: input.error,
  }
}

/** Initial state while first fetch is in flight (submit stays enabled). */
export function initialPreflightState(): PreflightState {
  return buildPreflightState({
    offline: false,
    loading: true,
    fetched_at: 0,
  })
}

/** HARD rule: only offline disables submit. */
export function canSubmitPreflight(state: PreflightState | null | undefined): boolean {
  if (!state) return true
  if (state.loading && state.mode === 'unknown' && state.fetched_at === 0) {
    // First paint: do not disable until we know offline.
    return true
  }
  return state.submit_enabled && state.mode !== 'offline'
}

type JsonResult = {
  reached: boolean
  status: number
  data: Record<string, unknown> | null
}

async function fetchJson(
  path: string,
  timeoutMs = 8000,
): Promise<JsonResult> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
      },
    })
    let data: Record<string, unknown> | null = null
    try {
      const raw: unknown = await res.json()
      if (raw && typeof raw === 'object') {
        data = raw as Record<string, unknown>
      }
    } catch {
      data = null
    }
    return { reached: true, status: res.status, data }
  } catch {
    return { reached: false, status: 0, data: null }
  } finally {
    window.clearTimeout(timer)
  }
}

function parseGate(
  value: unknown,
): QualityGatePayload | null {
  if (isQualityGatePayload(value)) return value
  // Loose parse for partial payloads (still extract dual signals).
  if (value === null || typeof value !== 'object') return null
  const g = value as Record<string, unknown>
  if (
    typeof g.species_id_allowed !== 'boolean' ||
    typeof g.metrics_acceptable !== 'boolean'
  ) {
    return null
  }
  return {
    species_id_allowed: g.species_id_allowed,
    metrics_acceptable: g.metrics_acceptable,
    block_enabled: typeof g.block_enabled === 'boolean' ? g.block_enabled : true,
    reason: typeof g.reason === 'string' ? g.reason : '',
    reason_code: (typeof g.reason_code === 'string'
      ? g.reason_code
      : 'unset') as QualityGateReasonCode,
    test_map_at_3:
      typeof g.test_map_at_3 === 'number' || g.test_map_at_3 === null
        ? (g.test_map_at_3 as number | null)
        : null,
    safety_recall_deadly:
      typeof g.safety_recall_deadly === 'number' ||
      g.safety_recall_deadly === null
        ? (g.safety_recall_deadly as number | null)
        : null,
    verdict: g.verdict === 'ACCEPTABLE' ? 'ACCEPTABLE' : 'UNACCEPTABLE',
  }
}

function catalogCountFromReadyz(data: Record<string, unknown> | null): number | undefined {
  if (!data) return undefined
  const checks = data.checks
  if (checks && typeof checks === 'object') {
    const c = checks as Record<string, unknown>
    const raw = c.catalog_count
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

/**
 * Fetch /readyz + /models/quality-gate and map to PreflightState.
 * Prefer nested quality_gate from readyz when present (B-10); fall back to
 * dedicated quality-gate endpoint.
 */
export async function fetchPreflight(): Promise<PreflightState> {
  const fetchedAt = Date.now()
  const [readyz, gateEndpoint] = await Promise.all([
    fetchJson('/readyz'),
    fetchJson('/models/quality-gate'),
  ])

  const anyReached = readyz.reached || gateEndpoint.reached
  if (!anyReached) {
    return buildPreflightState({
      offline: true,
      ready: false,
      fetched_at: fetchedAt,
      loading: false,
      error: 'api_unreachable',
    })
  }

  // Reachable but no usable JSON from either → treat as offline for submit.
  if (!readyz.data && !gateEndpoint.data) {
    return buildPreflightState({
      offline: true,
      ready: false,
      fetched_at: fetchedAt,
      loading: false,
      error: 'api_empty',
    })
  }

  const nestedGate = parseGate(readyz.data?.quality_gate)
  const endpointGate = parseGate(gateEndpoint.data)
  const gate = nestedGate ?? endpointGate

  const classifierMode =
    (typeof readyz.data?.classifier_mode === 'string'
      ? readyz.data.classifier_mode
      : null) ??
    (readyz.data?.checks &&
    typeof readyz.data.checks === 'object' &&
    typeof (readyz.data.checks as Record<string, unknown>).classifier_mode ===
      'string'
      ? String(
          (readyz.data.checks as Record<string, unknown>).classifier_mode,
        )
      : null)

  const ready = readyz.data?.ready === true
  const weightsPresent =
    typeof readyz.data?.weights_present === 'boolean'
      ? readyz.data.weights_present
      : undefined

  return buildPreflightState({
    offline: false,
    ready,
    classifier_mode: classifierMode,
    species_id_allowed: gate?.species_id_allowed ?? null,
    metrics_acceptable: gate?.metrics_acceptable ?? null,
    block_enabled: gate?.block_enabled ?? null,
    gate_reason: gate?.reason ?? null,
    reason_code: gate?.reason_code ?? null,
    map_at_3: gate?.test_map_at_3 ?? null,
    deadly_recall: gate?.safety_recall_deadly ?? null,
    catalog_count: catalogCountFromReadyz(readyz.data),
    weights_present: weightsPresent,
    fetched_at: fetchedAt,
    loading: false,
  })
}
