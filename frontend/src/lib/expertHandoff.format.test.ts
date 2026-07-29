import { describe, expect, it } from 'vitest'
import {
  buildExpertHandoff,
  buildLookalikeDiagnostics,
  formatHandoffSummary,
  HAND_OFF_DISCLAIMER,
} from './expertHandoff'
import type { ClassificationResult } from '../api/types'

function baseResult(over: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    request_id: 'req-1',
    decision: 'rejected',
    predictions: [{ species: 'Amanita phalloides', confidence: 0.42, risk_label: 'deadly' }],
    safety_level: 'unsafe_to_consume',
    recommend_human_review: true,
    dangerous_lookalikes: ['Amanita verna'],
    missing_evidence: ['gills'],
    rejection_reason: 'open_set',
    processing_time_ms: 12,
    observation_id: null,
    warnings: [],
    quality_warnings: [],
    questions_for_user: [],
    model_stack: null,
    open_set_reason: null,
    final_warning: 'No consumas setas solo con una app.',
    ...over,
  } as ClassificationResult
}

describe('formatHandoffSummary', () => {
  it('includes disclaimer and species, never consumption permission', () => {
    const draft = buildExpertHandoff({
      result: baseResult(),
      viewTypes: ['cap', 'gills'],
      previews: ['data:image/png;base64,xx'],
      notes: 'Base con volva',
    })
    const text = formatHandoffSummary(draft)
    expect(text).toContain(HAND_OFF_DISCLAIMER)
    expect(text).toContain('Amanita phalloides')
    expect(text).toContain('cap, gills')
    expect(text.toLowerCase()).not.toMatch(/segura para comer|safe to eat|puedes comer/)
    expect(text).toMatch(/No es permiso de consumo/i)
  })

  it('packages lookalike critical_views for mapped pairs (caesarea↔phalloides)', () => {
    const draft = buildExpertHandoff({
      result: baseResult({
        predictions: [
          { species: 'Amanita caesarea', confidence: 0.55, risk_label: 'unknown_or_risky' },
        ],
        dangerous_lookalikes: ['Amanita phalloides'],
      }),
      viewTypes: ['habitat'],
    })
    expect(draft.lookalike_diagnostics?.length).toBeGreaterThan(0)
    const d = draft.lookalike_diagnostics!.find((x) => /phalloides/i.test(x.mate))
    expect(d).toBeTruthy()
    expect(d!.critical_views).toContain('gills')
    expect(d!.missing_critical_views).toContain('gills')
    const text = formatHandoffSummary(draft)
    expect(text).toMatch(/Diagnóstico multi-vista|vistas discriminantes/i)
    expect(text.toLowerCase()).toMatch(/gills/)
    expect(text.toLowerCase()).not.toMatch(/permiso de consumo.*otorgado|safe to eat/)
  })
})

describe('buildLookalikeDiagnostics', () => {
  it('returns empty critical_views when pair not in map', () => {
    const diags = buildLookalikeDiagnostics(
      baseResult({
        predictions: [{ species: 'Trametes versicolor', confidence: 0.9 }],
        dangerous_lookalikes: ['Boletus edulis'],
      }),
      [],
    )
    expect(diags).toHaveLength(1)
    expect(diags[0].critical_views).toEqual([])
    expect(diags[0].pair_id).toBeNull()
  })
})
