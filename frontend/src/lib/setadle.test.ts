import { describe, expect, it } from 'vitest'
import { loadSpeciesCatalog } from '../data/speciesCatalog'
import {
  buildSetadlePool,
  compareClassic,
  hashSeed,
  pickDailySecret,
  resolveGuess,
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

  it('resolves guesses and typeahead', async () => {
    await loadSpeciesCatalog()
    const pool = buildSetadlePool()
    const s = pool[0]
    expect(resolveGuess(pool, s.taxon)?.taxon).toBe(s.taxon)
    const ta = typeaheadPool(pool, s.common.slice(0, 3), 5)
    expect(ta.length).toBeGreaterThan(0)
  })
})
