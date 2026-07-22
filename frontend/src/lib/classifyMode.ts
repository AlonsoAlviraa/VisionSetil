/**
 * Classification honesty mode helpers (Phase B / D-B20).
 *
 * - Prefer server-provided `mode` when present and valid.
 * - Legacy responses without `mode` use the D-B20 algorithm (no schema defaults).
 * - No zod (D-B19): narrow TypeScript guards only.
 */

import type {
  ClassificationResult,
  ClassifyMode,
  QualityGatePayload,
} from '../api/types'

export type { ClassifyMode, QualityGatePayload }

/** Canonical set of product honesty modes. */
export const CLASSIFY_MODES: readonly ClassifyMode[] = [
  'real',
  'mock',
  'blocked',
] as const

/** Narrow guard: value is a known ClassifyMode string (D-B19). */
export function isClassifyMode(value: unknown): value is ClassifyMode {
  return value === 'real' || value === 'mock' || value === 'blocked'
}

/** Narrow guard for dual-signal quality gate payload shape (minimal). */
export function isQualityGatePayload(
  value: unknown,
): value is QualityGatePayload {
  if (value === null || typeof value !== 'object') return false
  const g = value as Record<string, unknown>
  return (
    typeof g.species_id_allowed === 'boolean' &&
    typeof g.metrics_acceptable === 'boolean' &&
    typeof g.block_enabled === 'boolean' &&
    typeof g.reason === 'string' &&
    typeof g.reason_code === 'string' &&
    (g.verdict === 'ACCEPTABLE' || g.verdict === 'UNACCEPTABLE')
  )
}

/**
 * Quality-gate text signals seen on legacy blocked responses
 * (see backend quality_gate.apply_quality_gate_to_simple_result).
 */
const QUALITY_GATE_SIGNAL =
  /model_quality_gate|quality_gate|GATE\s+DE\s+CALIDAD/i

/**
 * Resolve product honesty mode for a /classify result (D-B20).
 *
 * When `mode` is present and valid → use it.
 * When absent (legacy / partial deploy):
 *  1. quality-gate signals in rejection_reason / ml_notes / warnings → blocked
 *  2. is_mock_stack === true → mock
 *  3. is_mock_stack === false → real
 *  4. is_mock_stack unknown → fail-closed:
 *     blocked if rejected + empty predictions, else mock
 */
export function resolveMode(result: ClassificationResult): ClassifyMode {
  if (isClassifyMode(result.mode)) {
    return result.mode
  }

  // Legacy response — do NOT trust client schema defaults as product truth
  const textBlob = [
    result.rejection_reason ?? '',
    ...(result.ml_notes ?? []),
    ...(result.warnings ?? []),
  ].join(' ')

  if (QUALITY_GATE_SIGNAL.test(textBlob)) {
    return 'blocked'
  }

  // Explicit GATE warning + empty rejected payload (legacy gate copy)
  const warningsText = (result.warnings ?? []).join(' ')
  if (
    result.decision === 'rejected' &&
    (result.predictions?.length ?? 0) === 0 &&
    /GATE/i.test(warningsText)
  ) {
    return 'blocked'
  }

  if (result.is_mock_stack === true) return 'mock'
  if (result.is_mock_stack === false) return 'real'

  // is_mock_stack absent/unknown — fail-closed toward blocked when rejected empty
  if (
    result.decision === 'rejected' &&
    (result.predictions?.length ?? 0) === 0
  ) {
    return 'blocked'
  }
  return 'mock'
}
