import { describe, expect, it } from 'vitest'
import type { ClassificationResult } from '../api/types'
import {
  collectDeadlyTopkHits,
  DEADLY_TOPK_PRODUCT_UNLOCK,
  deadlyTopkCoachCopy,
  hasDeadlyPredictionInTopk,
  shouldShowDeadlyTopkCoach,
} from './deadlyTopkHonesty'

function base(
  over: Partial<ClassificationResult> = {},
): Pick<ClassificationResult, 'predictions' | 'dangerous_lookalikes' | 'decision'> {
  return {
    decision: 'accepted',
    predictions: [],
    dangerous_lookalikes: [],
    ...over,
  }
}

describe('deadlyTopkHonesty', () => {
  it('never product_unlock', () => {
    expect(DEADLY_TOPK_PRODUCT_UNLOCK).toBe(false)
  })

  it('detects deadly prediction in top-k', () => {
    const r = base({
      predictions: [
        {
          species: 'Amanita phalloides',
          common_name: 'Cicuta verde',
          confidence: 0.4,
          edibility: 'deadly',
        },
      ],
    })
    expect(hasDeadlyPredictionInTopk(r.predictions)).toBe(true)
    expect(shouldShowDeadlyTopkCoach(r)).toBe(true)
    const hits = collectDeadlyTopkHits(r)
    expect(hits[0]?.risk).toBe('deadly')
    expect(hits[0]?.source).toBe('prediction')
  })

  it('shows coach for dangerous lookalikes even without deadly top-1', () => {
    const r = base({
      predictions: [
        {
          species: 'Russula cyanoxantha',
          common_name: null,
          confidence: 0.5,
          edibility: 'unknown',
        },
      ],
      dangerous_lookalikes: ['Amanita phalloides'],
    })
    expect(shouldShowDeadlyTopkCoach(r)).toBe(true)
  })

  it('hides coach when no severe signal', () => {
    const r = base({
      predictions: [
        {
          species: 'Boletus edulis',
          common_name: null,
          confidence: 0.6,
          edibility: 'unknown',
        },
      ],
      dangerous_lookalikes: [],
    })
    expect(shouldShowDeadlyTopkCoach(r)).toBe(false)
  })

  it('copy is orientation-only (ES/EN)', () => {
    const es = deadlyTopkCoachCopy('es')
    const en = deadlyTopkCoachCopy('en')
    expect(es.body.toLowerCase()).toMatch(/orientaci|nunca consum/)
    expect(en.body.toLowerCase()).toMatch(/orientation|never consum/)
    expect(es.title.toLowerCase()).not.toMatch(/excelente|confetti|comestible ok/)
    expect(en.title.toLowerCase()).not.toMatch(/safe to eat|confetti/)
  })
})
