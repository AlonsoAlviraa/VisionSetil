import { describe, expect, it } from 'vitest'
import { loadSpeciesCatalog } from '../data/speciesCatalog'
import {
  buildHabitatRound,
  buildSetadlePool,
  compareClassic,
  hashSeed,
  normalizeSetadleMode,
  pickDailySecret,
  resolveGuess,
  scoreHabitatSort,
  typeaheadPool,
} from './setadle'

describe('setadle', () => {
  it('builds a playable pool and daily secret', async () => {
    await loadSpeciesCatalog()
    const pool = buildSetadlePool()
    expect(pool.length).toBeGreaterThan(30)
    const a = pickDailySecret(pool, 'classic', '2026-07-23')
    const b = pickDailySecret(pool, 'classic', '2026-07-23')
    const c = pickDailySecret(pool, 'classic', '2026-07-24')
    expect(a.taxon).toBe(b.taxon)
    // Different day usually different secret (collision possible but rare)
    expect(hashSeed('setadle|2026-07-23|classic|v1')).not.toBe(
      hashSeed('setadle|2026-07-24|classic|v1'),
    )
    expect(a.slug.length).toBeGreaterThan(2)
    void c
  })

  it('compares classic attributes with tones', async () => {
    await loadSpeciesCatalog()
    const pool = buildSetadlePool()
    const secret = pool[0]
    const same = compareClassic(secret, secret)
    expect(same.won).toBe(true)
    expect(same.cells.every((c) => c.tone === 'correct' || c.value === '—')).toBe(true)
    const other = pool.find((p) => p.taxon !== secret.taxon)!
    const row = compareClassic(other, secret)
    expect(row.won).toBe(false)
    expect(row.cells.length).toBe(6)
  })

  it('fills classic meta (no Sin datos / — / desconocido empties)', async () => {
    await loadSpeciesCatalog()
    const pool = buildSetadlePool()
    expect(pool.length).toBeGreaterThan(30)
    const blanks = ['—', 'desconocido', 'Sin datos', '']
    for (const sp of pool) {
      expect(sp.family, sp.taxon).toBeTruthy()
      expect(sp.family).not.toBe('—')
      expect(sp.genus).toBeTruthy()
      expect(sp.genus).not.toBe('—')
      expect(sp.season).toBeTruthy()
      expect(blanks).not.toContain(sp.season)
      expect(sp.iberian).toBeTruthy()
      expect(blanks).not.toContain(sp.iberian)
      expect(sp.edibility).toBeTruthy()
      expect(sp.edibility.toLowerCase()).not.toBe('desconocido')
      expect(sp.edibility.toLowerCase()).not.toBe('sin datos')
    }
    const lac = pool.find((p) => p.taxon === 'Lactarius deliciosus')
      || pool.find((p) => p.genus === 'Lactarius')
    expect(lac).toBeTruthy()
    expect(lac!.family).toBe('Russulaceae')
    expect(lac!.genus).toBe('Lactarius')
    expect(lac!.season.length).toBeGreaterThan(2)
    expect(lac!.iberian.length).toBeGreaterThan(2)
    expect(lac!.edibility.toLowerCase()).not.toMatch(/desconocido|sin datos/)
  })

  it('resolves guesses and typeahead', async () => {
    await loadSpeciesCatalog()
    const pool = buildSetadlePool()
    const s = pool[0]
    expect(resolveGuess(pool, s.taxon)?.taxon).toBe(s.taxon)
    const ta = typeaheadPool(pool, s.common.slice(0, 3), 5)
    expect(ta.length).toBeGreaterThan(0)
  })

  it('normalizes legacy emoji mode to habitat', () => {
    expect(normalizeSetadleMode('emoji')).toBe('habitat')
    expect(normalizeSetadleMode('habitat')).toBe('habitat')
    expect(normalizeSetadleMode('classic')).toBe('classic')
    expect(normalizeSetadleMode('nope')).toBe(null)
  })

  it('builds habitat sort rounds and scores perfect placement', async () => {
    await loadSpeciesCatalog()
    const pool = buildSetadlePool()
    const a = buildHabitatRound(pool, '2026-07-23', 'daily')
    const b = buildHabitatRound(pool, '2026-07-23', 'daily')
    expect(a.habitat.id).toBe(b.habitat.id)
    expect(a.cards.length).toBeGreaterThanOrEqual(4)
    expect(a.cards.length).toBeLessThanOrEqual(6)
    const perfect: Record<string, 'yes' | 'no' | 'tray'> = {}
    for (const c of a.cards) perfect[c.taxon] = c.belongs ? 'yes' : 'no'
    const scored = scoreHabitatSort(a, perfect)
    expect(scored.won).toBe(true)
    expect(scored.correct).toBe(a.cards.length)
  })
})
