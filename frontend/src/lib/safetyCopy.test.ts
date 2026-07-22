import { describe, expect, it } from 'vitest'
import es from '../locales/es/common.json'
import ca from '../locales/ca/common.json'
import eu from '../locales/eu/common.json'
import en from '../locales/en/common.json'

/** Blacklist for identify-surface copy (PR-09 / PR-20a). */
const BLACKLIST: Record<string, string[]> = {
  es: ['seguro comer', 'excelente comestible', 'se puede comer', 'safe to eat'],
  ca: ['es pot menjar', 'segur menjar', 'excel·lent comestible'],
  eu: ['jan daiteke', 'jangarria da', 'segurua da jateko'],
  en: ['safe to eat', 'safe for consumption', 'good to eat', 'you can eat'],
}

describe('i18n safety copy blacklist (identify-critical keys)', () => {
  const packs = { es, ca, eu, en } as const

  for (const [loc, pack] of Object.entries(packs)) {
    it(`${loc}: safety strings avoid consumption confirmation`, () => {
      const safetyBlob = JSON.stringify((pack as typeof es).safety).toLowerCase()
      for (const phrase of BLACKLIST[loc] || []) {
        expect(safetyBlob.includes(phrase.toLowerCase())).toBe(false)
      }
    })

    it(`${loc}: identify surface has orientation messaging`, () => {
      const s = (pack as typeof es).safety
      expect(s.bannerBody.length).toBeGreaterThan(20)
      expect(s.orientationOnly.length).toBeGreaterThan(10)
    })
  }

  it('encyclopedia edibility labels include educational framing for excelente', () => {
    for (const pack of [es, ca, eu, en]) {
      const label = pack.edibility.excelente.toLowerCase()
      expect(
        label.includes('educat') ||
          label.includes('hezkuntza') ||
          label.includes('educational') ||
          label.includes('referen'),
      ).toBe(true)
    }
  })
})
