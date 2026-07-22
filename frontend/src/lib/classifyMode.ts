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
  return (
    typeof value === 'string' &&
    (CLASSIFY_MODES as readonly string[]).includes(value)
  )
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
 * Resolve product honesty mode for a /classify result (D-B20 §10).
 *
 * When `mode` is present and valid → use it.
 * When absent (legacy / partial deploy):
 *  1. `model_quality_gate|quality_gate` in rejection_reason / ml_notes → blocked
 *  2. else rejected + empty predictions + /GATE/i in warnings → blocked
 *  3. else is_mock_stack !== false → mock (true or unknown)
 *  4. else (is_mock_stack === false) → real
 *
 * Open-set abstention (rejected + empty, no gate signals) is NOT blocked —
 * mode is stack-derived; decision carries the abstention.
 *
 * Prefer {@link resolveDisplayMode} for UI (banner / shell / confidence): it
 * fail-closes on dual-signal `species_id_allowed === false` (D-B4).
 */
export function resolveMode(result: ClassificationResult): ClassifyMode {
  if (isClassifyMode(result.mode)) {
    return result.mode
  }

  // Legacy response (field missing) — do NOT trust client schema defaults (D-B20)
  const rr = `${result.rejection_reason || ''} ${(result.ml_notes || []).join(' ')}`
  if (
    /model_quality_gate|quality_gate/i.test(rr) ||
    (result.decision === 'rejected' &&
      (result.predictions?.length ?? 0) === 0 &&
      /GATE/i.test((result.warnings || []).join(' ')))
  ) {
    return 'blocked'
  }
  if (result.is_mock_stack !== false) return 'mock'
  return 'real'
}

/**
 * UI honesty mode: dual-signal policy overrides stack/legacy mode (D-B4).
 * If quality_gate.species_id_allowed === false → blocked (banner + shell align).
 * Does not mutate server `mode`; use for chrome only.
 */
export function resolveDisplayMode(result: ClassificationResult): ClassifyMode {
  if (result.quality_gate?.species_id_allowed === false) return 'blocked'
  return resolveMode(result)
}

/**
 * Confidence UI gate (D-B9): only when display mode is real AND metrics_acceptable.
 * Missing quality_gate → hide (fail-closed; never invent metrics truth).
 */
export function shouldShowConfidence(result: ClassificationResult): boolean {
  if (resolveDisplayMode(result) !== 'real') return false
  return result.quality_gate?.metrics_acceptable === true
}

/**
 * Educational blocked shell: display mode blocked, or empty preds with species
 * ID disallowed by gate policy (second branch covers inconsistent payloads
 * even if display mode path already forces blocked).
 * Open-set real+rejected with empty preds is NOT educational-blocked.
 */
export function shouldShowEducationalShell(
  result: ClassificationResult,
): boolean {
  if (resolveDisplayMode(result) === 'blocked') return true
  // Second branch: empty preds + gate policy deny (explicit for split-brain tests)
  const empty = (result.predictions?.length ?? 0) === 0
  if (empty && result.quality_gate?.species_id_allowed === false) return true
  return false
}

/** Open-set abstention: live stack allowed but model rejects (not gate-blocked). */
export function isOpenSetRejected(result: ClassificationResult): boolean {
  return (
    result.decision === 'rejected' &&
    resolveDisplayMode(result) !== 'blocked' &&
    !shouldShowEducationalShell(result)
  )
}
