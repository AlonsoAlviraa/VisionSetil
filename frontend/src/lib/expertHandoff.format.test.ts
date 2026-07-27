import { describe, expect, it } from 'vitest'
import {
  buildExpertHandoff,
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
})
