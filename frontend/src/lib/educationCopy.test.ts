import { describe, expect, it } from 'vitest'
import {
  SAFE_SPECIES_BLURB,
  isConsumptionPraise,
  sanitizeEducationalText,
} from './educationCopy'

describe('educationCopy sanitize (Wave B)', () => {
  it('strips edible praise and cooking language', () => {
    const out = sanitizeEducationalText(
      'Excelente comestible, deliciosa al freír. Seta de pino.',
    )
    expect(out.toLowerCase()).not.toMatch(/excelente comestible|delicios|freír/)
    expect(out).toMatch(/pino|Seta/i)
  })

  it('returns safe fallback for empty or junk', () => {
    expect(sanitizeEducationalText('')).toBe(SAFE_SPECIES_BLURB)
    expect(sanitizeEducationalText('deliciosa')).toBe(SAFE_SPECIES_BLURB)
  })

  it('detects consumption praise', () => {
    expect(isConsumptionPraise('muy comestible en otoño')).toBe(true)
    expect(isConsumptionPraise('Anillo blanco y volva')).toBe(false)
  })
})
