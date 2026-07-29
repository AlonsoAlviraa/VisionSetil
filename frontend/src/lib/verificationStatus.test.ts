import { describe, expect, it } from 'vitest'
import {
  resolveVerificationStatus,
  verificationBody,
  verificationTitle,
} from './verificationStatus'

describe('verificationStatus (iNat-inspired, never research-grade from model)', () => {
  it('abstains on rejected open-set', () => {
    const s = resolveVerificationStatus({
      decision: 'rejected',
      missing_evidence: [],
      recommend_human_review: false,
      dangerous_lookalikes: [],
      open_set_reason: 'low_margin',
      warnings: [],
    })
    expect(s.id).toBe('abstained')
    expect(s.isResearchGrade).toBe(false)
    expect(s.titleEn.toLowerCase()).not.toMatch(/research.?grade/)
  })

  it('needs more evidence when missing photos', () => {
    const s = resolveVerificationStatus({
      decision: 'accepted',
      missing_evidence: ['gills underside photo'],
      recommend_human_review: false,
      dangerous_lookalikes: [],
      open_set_reason: null,
      warnings: [],
    })
    expect(s.id).toBe('needs_more_evidence')
    expect(s.isResearchGrade).toBe(false)
  })

  it('needs expert when handoff recommended or lookalikes present', () => {
    const s = resolveVerificationStatus({
      decision: 'accepted',
      missing_evidence: [],
      recommend_human_review: true,
      dangerous_lookalikes: ['Amanita phalloides'],
      open_set_reason: null,
      warnings: [],
    })
    expect(s.id).toBe('needs_expert')
    expect(verificationBody(s, 'en').toLowerCase()).toMatch(/mycologist|community|never/)
    expect(verificationBody(s, 'en').toLowerCase()).not.toMatch(/safe to eat/)
  })

  it('provisional model cue never claims research-grade', () => {
    const s = resolveVerificationStatus({
      decision: 'accepted',
      missing_evidence: [],
      recommend_human_review: false,
      dangerous_lookalikes: [],
      open_set_reason: null,
      warnings: [],
    })
    expect(s.id).toBe('provisional_model_cue')
    expect(s.isResearchGrade).toBe(false)
    const blob = `${s.titleEs} ${s.titleEn} ${s.bodyEs} ${s.bodyEn}`.toLowerCase()
    expect(blob).toMatch(/provisional|orientaci[oó]n|not iNat research-grade|no es research-grade/i)
    expect(blob).not.toMatch(/safe to eat|permiso de consumo|edible clearance granted/)
    expect(verificationTitle(s, 'es')).toMatch(/provisional|pista/i)
  })
})
