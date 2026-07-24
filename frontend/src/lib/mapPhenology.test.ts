import { describe, expect, it } from 'vitest'
import {
  clampMonth,
  currentMonth1to12,
  filterZonesByHabitat,
  habitatChipCounts,
  habitatChipsForText,
  isInSeason,
  monthLabel,
  monthsFromSeasonText,
  phenologyOpacity,
  phenologyScore,
  PHENOLOGY_SEASON_WEIGHT,
  PHENOLOGY_WEATHER_WEIGHT,
  rankZonesByPhenology,
  resolveStoryRoute,
  seasonMatchForMonth,
  SEASON_MATCH_ADJACENT,
  SEASON_MATCH_IN,
  SEASON_MATCH_MACRO,
  SEASON_MATCH_OFF,
  STORY_ROUTE_STOPS,
  toggleHabitatChip,
  topPhenologyHotspots,
  weatherNorm,
  zoneHeroSpecies,
  zoneMatchesHabitatFilter,
} from './mapPhenology'

describe('clampMonth / currentMonth', () => {
  it('clamps to 1–12', () => {
    expect(clampMonth(0)).toBe(1)
    expect(clampMonth(13)).toBe(12)
    expect(clampMonth(7.4)).toBe(7)
    expect(clampMonth(Number.NaN)).toBe(1)
  })

  it('reads month from date', () => {
    expect(currentMonth1to12(new Date('2026-10-15'))).toBe(10)
    expect(currentMonth1to12(new Date('2026-01-02'))).toBe(1)
  })
})

describe('monthsFromSeasonText / seasonMatchForMonth', () => {
  it('maps Otoño to autumn months', () => {
    expect(monthsFromSeasonText('Otoño')).toEqual([9, 10, 11])
    expect(isInSeason('Otoño', 10)).toBe(true)
    expect(isInSeason('Otoño', 4)).toBe(false)
  })

  it('parses spring + morchellas and winter trufa', () => {
    const spring = monthsFromSeasonText('Otoño y primavera (morchellas)')
    expect(spring).toEqual(expect.arrayContaining([3, 4, 5, 9, 10, 11]))
    expect(isInSeason('Invierno (trufa)', 1)).toBe(true)
    expect(isInSeason('Invierno (trufa)', 7)).toBe(false)
  })

  it('parses month ranges like septiembre a diciembre', () => {
    const m = monthsFromSeasonText('Otoño (septiembre a diciembre)')
    expect(m).toEqual(expect.arrayContaining([9, 10, 11, 12]))
    expect(isInSeason('Otoño (septiembre a diciembre)', 12)).toBe(true)
  })

  it('exact seasonMatch ladder for full Otoño [9,10,11]', () => {
    // In-season
    expect(seasonMatchForMonth('Otoño', 10)).toBe(SEASON_MATCH_IN)
    expect(seasonMatchForMonth('Otoño', 9)).toBe(1)
    expect(seasonMatchForMonth('Otoño', 11)).toBe(1)
    // Adjacent shoulders (Aug before Sep; Dec after Nov)
    expect(seasonMatchForMonth('Otoño', 8)).toBe(SEASON_MATCH_ADJACENT)
    expect(seasonMatchForMonth('Otoño', 12)).toBe(SEASON_MATCH_ADJACENT)
    // Far off (winter/spring)
    expect(seasonMatchForMonth('Otoño', 2)).toBe(SEASON_MATCH_OFF)
    expect(seasonMatchForMonth('Otoño', 4)).toBe(SEASON_MATCH_OFF)
  })

  it('adjacent ≥ macro residual for partial [8,9] (finales de verano)', () => {
    // monthsFromSeasonText for "finales de verano" alone → [8,9]
    const text = 'Finales de verano'
    expect(monthsFromSeasonText(text)).toEqual([8, 9])

    // In-season
    expect(seasonMatchForMonth(text, 8)).toBe(SEASON_MATCH_IN)
    expect(seasonMatchForMonth(text, 9)).toBe(SEASON_MATCH_IN)
    // Adjacent: July next to 8; October next to 9
    expect(seasonMatchForMonth(text, 7)).toBe(SEASON_MATCH_ADJACENT)
    expect(seasonMatchForMonth(text, 10)).toBe(SEASON_MATCH_ADJACENT)
    // Same macro-season residual (verano June, not adjacent to [8,9])
    expect(seasonMatchForMonth(text, 6)).toBe(SEASON_MATCH_MACRO)
    // Off
    expect(seasonMatchForMonth(text, 2)).toBe(SEASON_MATCH_OFF)

    // Monotonic: adjacent must not lose to same-macro non-adjacent
    expect(SEASON_MATCH_ADJACENT).toBeGreaterThanOrEqual(SEASON_MATCH_MACRO)
    expect(seasonMatchForMonth(text, 7)).toBeGreaterThanOrEqual(
      seasonMatchForMonth(text, 6),
    )
  })

  it('defaults empty season text to autumn', () => {
    expect(monthsFromSeasonText('')).toEqual([9, 10, 11])
    expect(monthsFromSeasonText(null)).toEqual([9, 10, 11])
  })
})

describe('phenologyScore formula', () => {
  it('documents weights summing to 1', () => {
    expect(PHENOLOGY_SEASON_WEIGHT + PHENOLOGY_WEATHER_WEIGHT).toBeCloseTo(1, 5)
  })

  it('blends season match × weather (pure)', () => {
    // In season + weather 100 → 100
    expect(phenologyScore('Otoño', 10, 100)).toBe(100)
    // In season + weather 0 → round(100 * 0.55) = 55
    expect(phenologyScore('Otoño', 10, 0)).toBe(55)
    // Off season + weather 100 → round(100 * (0.55*0.12 + 0.45)) = 52
    expect(phenologyScore('Otoño', 2, 100)).toBe(
      Math.round(100 * (0.55 * SEASON_MATCH_OFF + 0.45 * 1)),
    )
    // Adjacent + weather 100
    expect(phenologyScore('Otoño', 8, 100)).toBe(
      Math.round(100 * (0.55 * SEASON_MATCH_ADJACENT + 0.45 * 1)),
    )
    // Unknown weather uses 0.5 norm
    expect(weatherNorm(null)).toBe(0.5)
    expect(phenologyScore('Otoño', 10, null)).toBe(
      Math.round(100 * (0.55 * 1 + 0.45 * 0.5)),
    )
  })

  it('opacity is higher in season than off season', () => {
    const inOp = phenologyOpacity('Otoño', 10, 80)
    const offOp = phenologyOpacity('Otoño', 2, 80)
    expect(inOp).toBeGreaterThan(offOp)
    expect(inOp).toBeLessThanOrEqual(1)
    expect(offOp).toBeGreaterThanOrEqual(0.15)
  })
})

describe('rankZonesByPhenology / topPhenologyHotspots', () => {
  const zones = [
    { id: 'a', season: 'Otoño' },
    { id: 'b', season: 'Primavera' },
    { id: 'c', season: 'Otoño y primavera' },
  ]
  const weather = { a: 40, b: 90, c: 70 }

  it('ranks October: autumn zones above pure spring', () => {
    const ranked = rankZonesByPhenology(zones, 10, weather)
    expect(ranked[0].inSeason).toBe(true)
    // b is off-season in Oct despite high weather
    const b = ranked.find((r) => r.id === 'b')!
    const a = ranked.find((r) => r.id === 'a')!
    expect(a.score).toBeGreaterThan(b.score)
  })

  it('topPhenologyHotspots limits and sorts', () => {
    const top = topPhenologyHotspots(
      ['a', 'b', 'c'],
      { a: 'Otoño', b: 'Primavera', c: 'Otoño' },
      weather,
      10,
      2,
    )
    expect(top).toHaveLength(2)
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score)
  })
})

describe('habitat filter', () => {
  it('derives chips from habitat free text', () => {
    expect(habitatChipsForText('Hayedos y robledales atlánticos')).toEqual(
      expect.arrayContaining(['hayedo', 'robledal']),
    )
    expect(habitatChipsForText('Pinares albares extensos')).toContain('pinar')
    expect(habitatChipsForText('Dehesas y montes mediterráneos')).toContain(
      'dehesa',
    )
  })

  it('filters zones by selected chips (OR)', () => {
    const zones = [
      { id: '1', habitat: 'Hayedos de montaña' },
      { id: '2', habitat: 'Pinares mediterráneos' },
      { id: '3', habitat: 'Pradera y pastizales' },
    ]
    expect(filterZonesByHabitat(zones, []).map((z) => z.id)).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(filterZonesByHabitat(zones, ['pinar']).map((z) => z.id)).toEqual([
      '2',
    ])
    expect(
      filterZonesByHabitat(zones, ['hayedo', 'pradera']).map((z) => z.id),
    ).toEqual(['1', '3'])
    expect(zoneMatchesHabitatFilter('Pinar y hayedo', ['hayedo'])).toBe(true)
    expect(zoneMatchesHabitatFilter('Dehesa', ['pinar'])).toBe(false)
  })

  it('counts chips and toggles selection', () => {
    const zones = [
      { habitat: 'Hayedo y pinar' },
      { habitat: 'Pinar mediterráneo' },
    ]
    const c = habitatChipCounts(zones)
    expect(c.hayedo).toBe(1)
    expect(c.pinar).toBe(2)
    expect(toggleHabitatChip(['hayedo'], 'pinar')).toEqual(['hayedo', 'pinar'])
    expect(toggleHabitatChip(['hayedo', 'pinar'], 'hayedo')).toEqual(['pinar'])
  })
})

describe('zoneHeroSpecies', () => {
  it('returns up to 6 unique taxa (max cap)', () => {
    const sp = [
      'Boletus edulis',
      'Boletus edulis',
      'Amanita phalloides',
      'Lactarius deliciosus',
      'Cantharellus cibarius',
      'Hydnum repandum',
      'Macrolepiota procera',
      'Russula virescens',
    ]
    const hero = zoneHeroSpecies(sp)
    expect(hero.length).toBe(6)
    expect(new Set(hero).size).toBe(hero.length)
    expect(zoneHeroSpecies(sp, 4)).toHaveLength(4)
  })

  it('handles short lists without enforcing min', () => {
    expect(zoneHeroSpecies(['A'])).toEqual(['A'])
    expect(zoneHeroSpecies([])).toEqual([])
  })
})

describe('monthLabel i18n', () => {
  it('formats long/short via Intl locale', () => {
    const es = monthLabel(10, 'es', 'long')
    expect(es.toLowerCase()).toMatch(/oct/)
    const en = monthLabel(10, 'en', 'long')
    expect(en.toLowerCase()).toMatch(/oct/)
    expect(monthLabel(1, 'es', 'short').length).toBeGreaterThan(0)
  })
})

describe('story route', () => {
  it('defines 3 classic educational stops without forage language', () => {
    expect(STORY_ROUTE_STOPS).toHaveLength(3)
    for (const s of STORY_ROUTE_STOPS) {
      const bag = `${s.narrationEs} ${s.narrationEn ?? ''}`.toLowerCase()
      expect(bag).not.toMatch(/mejor sitio para coger|permiso de recolectar setas comestibles/)
      expect(bag).toMatch(/educativ|estudio|observ|paisaje|h[aá]bitat|fenolog|orientaci/)
    }
  })

  it('resolves stops against available ids with fallbacks', () => {
    const r = resolveStoryRoute([
      'soria-pinares',
      'asturias-oriental',
      'pirineo-catalan',
    ])
    expect(r.map((x) => x.id)).toEqual(['soria', 'picos', 'pirineo'])
    expect(r[2].resolvedZoneId).toBe('pirineo-catalan')
  })

  it('skips missing stops', () => {
    const r = resolveStoryRoute(['soria-pinares'])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('soria')
  })
})
