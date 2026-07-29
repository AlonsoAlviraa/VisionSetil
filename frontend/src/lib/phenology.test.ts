import { describe, expect, it } from 'vitest'
import {
  activeMonthsFromSeason,
  buildPhenologyBar,
  isInSeasonNow,
  parseSeasonTokens,
} from './phenology'

describe('phenology educational season bar', () => {
  it('parses Spanish multi-season strings', () => {
    expect(parseSeasonTokens('Verano y otoño')).toEqual(['verano', 'otono'])
    expect(parseSeasonTokens('Primavera y otoño')).toContain('primavera')
  })

  it('parses all-year tokens', () => {
    const all = parseSeasonTokens('Todo el año')
    expect(all).toHaveLength(4)
  })

  it('maps otoño months Sep–Nov', () => {
    const months = activeMonthsFromSeason('Otoño')
    expect(months.has(9)).toBe(true)
    expect(months.has(10)).toBe(true)
    expect(months.has(11)).toBe(true)
    expect(months.has(6)).toBe(false)
  })

  it('builds bar with current month marker', () => {
    const bar = buildPhenologyBar('Otoño', {
      locale: 'es',
      now: new Date(2026, 9, 15), // Oct
    })
    expect(bar.months).toHaveLength(12)
    const oct = bar.months.find((m) => m.month === 10)
    expect(oct?.active).toBe(true)
    expect(oct?.isCurrent).toBe(true)
    expect(bar.disclaimer.toLowerCase()).toMatch(/educativ|no es calendario|recolecci/)
  })

  it('never invents months for empty season', () => {
    const bar = buildPhenologyBar('', { now: new Date(2026, 0, 1) })
    expect(bar.months.every((m) => !m.active)).toBe(true)
  })

  it('isInSeasonNow is honest', () => {
    expect(isInSeasonNow('Otoño', new Date(2026, 9, 1))).toBe(true)
    expect(isInSeasonNow('Otoño', new Date(2026, 0, 1))).toBe(false)
  })
})
