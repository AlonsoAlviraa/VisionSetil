import { describe, expect, it } from 'vitest'
import {
  currentSeason,
  isSeasonPackEnabled,
  seasonFromMonth,
  seasonRadarSnapshot,
  seasonRadarSnapshotSync,
  SEASON_PACK,
  SEASON_TAXON_SEEDS,
  taxaForSeason,
  taxaForSeasonFromPack,
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
        expect(`${t.common_name} ${t.taxon}`.toLowerCase()).not.toMatch(
          /permiso de recolect|seguro recolect/,
        )
      }
    }
  })

  it('snapshot includes disclaimer', () => {
    const snap = seasonRadarSnapshot(new Date('2026-03-01'))
    expect(snap.season.id).toBe('primavera')
    expect(snap.disclaimer.toLowerCase()).toMatch(/orientaci|educativ|consumo|recolecci/)
    expect(snap.taxa.length).toBeGreaterThan(0)
  })

  it('pack is present and enables pack path by default', () => {
    expect(SEASON_PACK.version).toBe(1)
    expect(isSeasonPackEnabled()).toBe(true)
    expect(Object.keys(SEASON_PACK.seasons)).toEqual(
      expect.arrayContaining(['primavera', 'verano', 'otono', 'invierno']),
    )
  })

  it('pack seeds include Verpa conica (not bohemica) and resolve slugs', () => {
    expect(SEASON_TAXON_SEEDS.primavera).toContain('Verpa conica')
    expect(SEASON_TAXON_SEEDS.primavera).not.toContain('Verpa bohemica')
    const spring = taxaForSeasonFromPack('primavera')
    expect(spring.some((t) => t.slug === 'verpa-conica')).toBe(true)
    for (const t of spring) {
      expect(t.slug.length).toBeGreaterThan(2)
      expect(t.in_catalog).toBe(true)
    }
  })

  it('sync snapshot does not require catalog hydrate', () => {
    const snap = seasonRadarSnapshotSync(new Date('2026-10-01'))
    expect(snap.season.id).toBe('otono')
    expect(snap.taxa.length).toBeGreaterThan(0)
    expect(snap.disclaimer.toLowerCase()).toMatch(/educativ|recolecci|consumo/)
  })
})
