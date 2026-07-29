import { describe, expect, it } from 'vitest'
import {
  classifyEceBand,
  clearEceBandCache,
  eceBandFromModelsStatus,
  eceConfidenceStickyLine,
  eceProductGuidance,
  E20_ECE_SNAPSHOT,
  normalizeEceResidual,
  resolveIdentifyConfidenceChrome,
  ECE_MODERATE_MAX,
} from './eceHonesty'

describe('eceHonesty (M2 residual)', () => {
  it('classifies E20-like high ECE as high residual', () => {
    expect(classifyEceBand(0.1878)).toBe('high')
    expect(classifyEceBand(0.04)).toBe('good')
    expect(classifyEceBand(0.1)).toBe('moderate')
    expect(classifyEceBand(null)).toBe('unknown')
    expect(classifyEceBand(ECE_MODERATE_MAX)).toBe('high')
    expect(E20_ECE_SNAPSHOT.band).toBe('high')
    expect(E20_ECE_SNAPSHOT.product_unlock).toBe(false)
  })

  it('high band de-emphasizes confidence and forbids unlock language', () => {
    const g = eceProductGuidance('high')
    expect(g.showConfidence).toBe(false)
    expect(g.deemphasizeConfidence).toBe(true)
    expect(g.summaryEs.toLowerCase()).toMatch(/nunca permiso de consumo|no confiar/)
    expect(g.summaryEn.toLowerCase()).toMatch(/never consumption|do not trust/)
  })

  it('normalizes API block with productUnlock forced false', () => {
    const n = normalizeEceResidual({
      status: 'ok',
      test_ece: 0.188,
      band: 'high',
      product_unlock: true, // hostile — must not surface
      guidance: {
        summary_es: 'ECE alto residual · nunca consumo',
      },
    })
    expect(n.band).toBe('high')
    expect(n.ece).toBeCloseTo(0.188)
    expect(n.productUnlock).toBe(false)
    expect(n.summary).toMatch(/nunca consumo|ECE alto/)
  })

  it('v1.9.6 Identify confidence chrome: gate+high ECE hides % (never unlock)', () => {
    // Soft MAP gates would allow confidence; ECE residual must still hide
    const chrome = resolveIdentifyConfidenceChrome(true, E20_ECE_SNAPSHOT.band)
    expect(chrome.show).toBe(false)
    expect(chrome.hideNumericPercent).toBe(true)
    expect(chrome.deemphasize).toBe(true)
    expect(chrome.productUnlock).toBe(false)
    expect(chrome.noteEs.toLowerCase()).toMatch(/nunca|no confiar|ece/)

    // Gate already closed stays closed
    const closed = resolveIdentifyConfidenceChrome(false, 'good')
    expect(closed.show).toBe(false)

    // Moderate: gate allows → show but deemphasize
    const mod = resolveIdentifyConfidenceChrome(true, 'moderate')
    expect(mod.show).toBe(true)
    expect(mod.deemphasize).toBe(true)

    const sticky = eceConfidenceStickyLine('high', 'en')
    expect(sticky.toLowerCase()).toMatch(/never consumption|do not trust/)
  })

  it('v1.9.7 eceBandFromModelsStatus prefers live residual, else snapshot', () => {
    clearEceBandCache()
    const live = eceBandFromModelsStatus({
      ece_residual: {
        status: 'ok',
        test_ece: 0.1878,
        band: 'high',
        product_unlock: true,
      },
      summary: { ece: 0.1878, ece_band: 'high' },
    })
    expect(live.source).toBe('live')
    expect(live.band).toBe('high')
    expect(live.productUnlock).toBe(false)

    const fromSummary = eceBandFromModelsStatus({
      summary: { ece: 0.04, ece_band: 'good' },
    })
    expect(fromSummary.source).toBe('live')
    expect(fromSummary.band).toBe('good')

    const snap = eceBandFromModelsStatus({})
    expect(snap.source).toBe('snapshot')
    expect(snap.band).toBe(E20_ECE_SNAPSHOT.band)
    expect(snap.productUnlock).toBe(false)
  })
})
