import { describe, expect, it } from 'vitest'
import {
  currentSeason,
  seasonFromMonth,
  seasonRadarSnapshot,
  taxaForSeason,
} from './seasonRadar'

describe('season radar', () => {
  it('maps months to seasons', () => {
    expect(seasonFromMonth(1)).toBe('invierno')
    expect(seasonFromMonth(4)).toBe('primavera')
    expect(seasonFromMonth(7)).toBe('verano')
    expect(seasonFromMonth(10)).toBe('otono')
  })

  it('returns Spanish labels for current season', () => {
    const s = currentSeason(new Date('2026-10-15'))
    expect(s.id).toBe('otono')
    expect(s.labelEs).toBe('Otoño')
    expect(s.months).toMatch(/Septiembre/)
  })

  it('lists educational taxa without consumption language', () => {
    for (const id of ['primavera', 'verano', 'otono', 'invierno'] as const) {
      const taxa = taxaForSeason(id)
      expect(taxa.length).toBeGreaterThan(0)
      for (const t of taxa) {
        expect(t.taxon.length).toBeGreaterThan(2)
        expect(t.common_name.toLowerCase()).not.toMatch(/safe to eat|segura para comer/)
      }
    }
  })

  it('snapshot includes disclaimer', () => {
    const snap = seasonRadarSnapshot(new Date('2026-03-01'))
    expect(snap.season.id).toBe('primavera')
    expect(snap.disclaimer.toLowerCase()).toMatch(/orientaci|educativ|consumo/)
    expect(snap.taxa.length).toBeGreaterThan(0)
  })
})
