import { describe, expect, it } from 'vitest'
import type { ClassificationResult } from '../api/types'
import {
  isClassifyMode,
  isOpenSetRejected,
  isQualityGatePayload,
  resolveMode,
  shouldShowConfidence,
  shouldShowEducationalShell,
} from './classifyMode'

function baseResult(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    request_id: 'test-req',
    decision: 'accepted',
    predictions: [
      {
        species: 'Boletus edulis',
        common_name: 'Porcini',
        confidence: 0.9,
        edibility: 'edible',
      },
    ],
    rejection_reason: null,
    processing_time_ms: 10,
    observation_id: null,
    safety_level: 'unknown_or_risky',
    missing_evidence: [],
    warnings: [],
    quality_warnings: [],
    dangerous_lookalikes: [],
    questions_for_user: [],
    model_stack: null,
    open_set_reason: null,
    recommend_human_review: false,
    final_warning: '',
    ...overrides,
  }
}

describe('isClassifyMode', () => {
  it('accepts real | mock | blocked', () => {
    expect(isClassifyMode('real')).toBe(true)
    expect(isClassifyMode('mock')).toBe(true)
    expect(isClassifyMode('blocked')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isClassifyMode('demo')).toBe(false)
    expect(isClassifyMode(undefined)).toBe(false)
    expect(isClassifyMode(null)).toBe(false)
    expect(isClassifyMode('')).toBe(false)
  })
})

describe('isQualityGatePayload', () => {
  it('accepts dual-signal payload', () => {
    expect(
      isQualityGatePayload({
        species_id_allowed: false,
        metrics_acceptable: false,
        block_enabled: true,
        reason: 'map_below_threshold',
        reason_code: 'map_below',
        verdict: 'UNACCEPTABLE',
      }),
    ).toBe(true)
  })

  it('rejects incomplete objects', () => {
    expect(isQualityGatePayload({})).toBe(false)
    expect(isQualityGatePayload(null)).toBe(false)
    expect(
      isQualityGatePayload({
        species_id_allowed: true,
        metrics_acceptable: true,
        block_enabled: false,
        reason: 'ok',
        reason_code: 'gates_passed',
        verdict: 'MAYBE',
      }),
    ).toBe(false)
  })
})

describe('resolveMode (D-B20)', () => {
  it('returns server mode when present and valid', () => {
    expect(resolveMode(baseResult({ mode: 'real', is_mock_stack: true }))).toBe(
      'real',
    )
    expect(
      resolveMode(baseResult({ mode: 'mock', is_mock_stack: false })),
    ).toBe('mock')
    expect(
      resolveMode(baseResult({ mode: 'blocked', is_mock_stack: false })),
    ).toBe('blocked')
  })

  it('ignores invalid mode strings and falls back to legacy', () => {
    const r = baseResult({
      mode: 'demo' as ClassificationResult['mode'],
      is_mock_stack: false,
    })
    expect(resolveMode(r)).toBe('real')
  })

  it('legacy: quality gate signal in rejection_reason → blocked', () => {
    const r = baseResult({
      decision: 'rejected',
      predictions: [],
      rejection_reason:
        'model_quality_gate_failed: MAP@3=0.05 — identificación BLOQUEADA',
      is_mock_stack: false,
    })
    expect(resolveMode(r)).toBe('blocked')
  })

  it('legacy: quality_gate in ml_notes → blocked', () => {
    const r = baseResult({
      decision: 'rejected',
      predictions: [],
      ml_notes: ['quality_gate=UNACCEPTABLE: map_below'],
      is_mock_stack: true,
    })
    expect(resolveMode(r)).toBe('blocked')
  })

  it('legacy: GATE in warnings + rejected empty → blocked', () => {
    const r = baseResult({
      decision: 'rejected',
      predictions: [],
      warnings: [
        'GATE DE CALIDAD: el modelo actual NO es aceptable para identificar especies',
      ],
      is_mock_stack: false,
    })
    expect(resolveMode(r)).toBe('blocked')
  })

  it('legacy: GATE in warnings alone does not block without rejected+empty', () => {
    // D-B20: warnings /GATE/ only applies with decision=rejected && empty preds
    const r = baseResult({
      decision: 'accepted',
      predictions: [
        {
          species: 'Boletus edulis',
          common_name: null,
          confidence: 0.5,
          edibility: null,
        },
      ],
      warnings: ['GATE DE CALIDAD: noise'],
      is_mock_stack: false,
    })
    expect(resolveMode(r)).toBe('real')
  })

  it('legacy: is_mock_stack true → mock', () => {
    expect(resolveMode(baseResult({ is_mock_stack: true }))).toBe('mock')
  })

  it('legacy: is_mock_stack false → real', () => {
    expect(resolveMode(baseResult({ is_mock_stack: false }))).toBe('real')
  })

  it('legacy: is_mock_stack absent + open-set rejected empty → mock (not blocked)', () => {
    // Open-set abstention is decision=rejected, not mode=blocked (D-B20)
    const r = baseResult({
      decision: 'rejected',
      predictions: [],
      rejection_reason: 'open_set_uncertain',
      // is_mock_stack intentionally omitted
    })
    expect(resolveMode(r)).toBe('mock')
  })

  it('legacy: is_mock_stack absent + accepted predictions → mock', () => {
    const r = baseResult({
      decision: 'accepted',
      // is_mock_stack omitted
    })
    expect(resolveMode(r)).toBe('mock')
  })

  it('mode takes precedence over gate-like rejection_reason', () => {
    // Server already set mode=real (e.g. gate disabled path); trust it
    const r = baseResult({
      mode: 'real',
      rejection_reason: 'model_quality_gate_failed: should not matter',
      is_mock_stack: false,
    })
    expect(resolveMode(r)).toBe('real')
  })
})

describe('shouldShowConfidence (D-B9)', () => {
  it('shows only for real + metrics_acceptable', () => {
    expect(
      shouldShowConfidence(
        baseResult({
          mode: 'real',
          quality_gate: {
            species_id_allowed: true,
            metrics_acceptable: true,
            block_enabled: true,
            reason: 'ok',
            reason_code: 'gates_passed',
            verdict: 'ACCEPTABLE',
          },
        }),
      ),
    ).toBe(true)
  })

  it('hides for mock / blocked / real without metrics_acceptable', () => {
    expect(shouldShowConfidence(baseResult({ mode: 'mock' }))).toBe(false)
    expect(shouldShowConfidence(baseResult({ mode: 'blocked' }))).toBe(false)
    expect(
      shouldShowConfidence(
        baseResult({
          mode: 'real',
          quality_gate: {
            species_id_allowed: true,
            metrics_acceptable: false,
            block_enabled: false,
            reason: 'gate_disabled',
            reason_code: 'gate_disabled',
            verdict: 'UNACCEPTABLE',
          },
        }),
      ),
    ).toBe(false)
    expect(
      shouldShowConfidence(baseResult({ mode: 'real', is_mock_stack: false })),
    ).toBe(false)
  })
})

describe('shouldShowEducationalShell / isOpenSetRejected', () => {
  it('blocked mode → educational shell', () => {
    const r = baseResult({
      mode: 'blocked',
      decision: 'rejected',
      predictions: [],
    })
    expect(shouldShowEducationalShell(r)).toBe(true)
    expect(isOpenSetRejected(r)).toBe(false)
  })

  it('real + rejected open-set → not educational shell', () => {
    const r = baseResult({
      mode: 'real',
      decision: 'rejected',
      predictions: [],
      rejection_reason: 'open_set_uncertain',
      quality_gate: {
        species_id_allowed: true,
        metrics_acceptable: true,
        block_enabled: true,
        reason: 'ok',
        reason_code: 'gates_passed',
        verdict: 'ACCEPTABLE',
      },
    })
    expect(shouldShowEducationalShell(r)).toBe(false)
    expect(isOpenSetRejected(r)).toBe(true)
  })
})
