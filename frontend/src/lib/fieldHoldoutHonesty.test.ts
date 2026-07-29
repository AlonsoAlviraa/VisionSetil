import { describe, expect, it } from 'vitest'
import {
  FIELD_HOLDOUT_PROTOCOL,
  FIELD_HOLDOUT_SNAPSHOT,
  fieldHoldoutCoachLines,
  formatMap3Delta,
  normalizeFieldHoldoutApi,
} from './fieldHoldoutHonesty'

describe('fieldHoldoutHonesty (M3)', () => {
  it('snapshot keeps product_unlock false and positive general multi-view delta', () => {
    expect(FIELD_HOLDOUT_SNAPSHOT.product_unlock).toBe(false)
    expect(FIELD_HOLDOUT_SNAPSHOT.map3_4_minus_1).toBeGreaterThan(0)
    expect(FIELD_HOLDOUT_SNAPSHOT.deadly_multiview_flat).toBe(true)
    expect(FIELD_HOLDOUT_PROTOCOL).toMatch(/same_specimen/)
  })

  it('coach lines never imply consumption or unlock', () => {
    const es = fieldHoldoutCoachLines('es')
    expect(es.body.toLowerCase()).toMatch(/orientaci|map@3/)
    expect(es.deadlyNote.toLowerCase()).toMatch(/mortal|consumo|lookalike|open-set/)
    expect(es.policy.toLowerCase()).toMatch(/nunca|product_unlock|consumo/)
    const en = fieldHoldoutCoachLines('en')
    expect(en.policy.toLowerCase()).toMatch(/never|consumption|product_unlock/)
    expect(en.deadlyNote.toLowerCase()).toMatch(/deadly|lookalike|open-set/)
  })

  it('formats delta and normalizes API fail-closed unlock', () => {
    expect(formatMap3Delta(0.0764)).toMatch(/\+7\.6/)
    const n = normalizeFieldHoldoutApi({
      protocol: FIELD_HOLDOUT_PROTOCOL,
      gates_pass: true,
      deadly_multiview_caveat: true,
      product_unlock: true,
      headline: { map3_4_minus_1: 0.0764 },
      readiness: { status: 'ready' },
    })
    expect(n.productUnlock).toBe(false)
    expect(n.gatesPass).toBe(true)
    expect(n.map3Delta).toBeCloseTo(0.0764)
    expect(n.deadlyCaveat).toBe(true)
  })
})
