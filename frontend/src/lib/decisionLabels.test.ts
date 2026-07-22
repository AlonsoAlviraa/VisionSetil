import { describe, expect, it } from 'vitest'
import { decisionHintEs, decisionLabelEs } from './decisionLabels'

describe('decisionLabels (Wave A)', () => {
  it('humanizes accepted / rejected', () => {
    expect(decisionLabelEs('accepted')).toBe('Pista tentativa')
    expect(decisionLabelEs('rejected')).toBe('Sin ID fiable')
    expect(decisionLabelEs('ACCEPTED')).toBe('Pista tentativa')
  })

  it('handles empty and unknown', () => {
    expect(decisionLabelEs(null)).toBe('Sin decisión')
    expect(decisionLabelEs(undefined)).toBe('Sin decisión')
    expect(decisionLabelEs('')).toBe('Sin decisión')
    expect(decisionLabelEs('pending')).toBe('pending')
  })

  it('provides short hints', () => {
    expect(decisionHintEs('accepted')).toMatch(/orientaci/i)
    expect(decisionHintEs('rejected')).toMatch(/abstener/i)
    expect(decisionHintEs('other')).toBe('')
  })
})
