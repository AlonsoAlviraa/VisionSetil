import { describe, expect, it } from 'vitest'
import { openSetReasonFallback, openSetReasonI18nKey } from './openSetReason'

describe('openSetReason', () => {
  it('maps known codes to i18n keys', () => {
    expect(openSetReasonI18nKey('high_entropy')).toBe('honesty.open_set_reason.high_entropy')
    expect(openSetReasonI18nKey('low_margin')).toBe('honesty.open_set_reason.low_margin')
    expect(openSetReasonI18nKey('low_top1_confidence')).toBe(
      'honesty.open_set_reason.low_top1_confidence',
    )
  })

  it('maps quality gate reasons to gate decision key', () => {
    expect(openSetReasonI18nKey('model_quality_gate_failed: map_below')).toBe(
      'honesty.decision.rejected_gate',
    )
  })

  it('returns null for empty', () => {
    expect(openSetReasonI18nKey(null)).toBeNull()
    expect(openSetReasonI18nKey('')).toBeNull()
  })

  it('fallback Spanish for high_entropy', () => {
    expect(openSetReasonFallback('high_entropy', 'es')).toMatch(/entrop/i)
    expect(openSetReasonFallback('high_entropy', 'en')).toMatch(/entropy/i)
  })
})
