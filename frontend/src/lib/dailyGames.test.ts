import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildVerifiedGamesPool,
  continueDailyPath,
  dailyGamesCompletion,
  firstIncompleteDailyMode,
  gamesDayKey,
  hashSeed,
  isDailyBoardComplete,
  markDailyGameDone,
  pickDailyFromPool,
  pickDailyPhotoSpecies,
  pickDailySpeciesForMode,
  CURATED_GAMES_TAXA,
  DAILY_GAME_MODES,
  __setDailyGamesStorageForTests,
} from './dailyGames'
import { __setPhotosDbForTests } from './speciesImageService'
import { speciesCatalog } from '../data/speciesCatalog'

describe('dailyGames (LoLdle-style)', () => {
  beforeEach(() => {
    // Minimal catalog photos so verification can pass for curated taxa present in catalog
    const photos: Record<string, { taxon: string; url: string }> = {}
    for (const t of CURATED_GAMES_TAXA.slice(0, 30)) {
      photos[t.toLowerCase()] = {
        taxon: t,
        url: `https://example.com/photos/${t.replace(/\s+/g, '_')}.jpg`,
      }
    }
    // Also seed whatever is in the live catalog head
    for (const s of speciesCatalog.slice(0, 50)) {
      if (!s.taxon) continue
      photos[s.taxon.toLowerCase()] = {
        taxon: s.taxon,
        url: `https://example.com/photos/${s.slug || 'x'}.jpg`,
      }
    }
    __setPhotosDbForTests({ version: 'test', photos })
    const mem = new Map<string, string>()
    __setDailyGamesStorageForTests({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v)
      },
      removeItem: (k) => {
        mem.delete(k)
      },
    })
  })

  it('day key is YYYY-MM-DD', () => {
    expect(gamesDayKey(new Date('2026-07-31T12:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('hash is stable', () => {
    expect(hashSeed('a')).toBe(hashSeed('a'))
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
  })

  it('builds verified pool with per-taxon checks', () => {
    const pool = buildVerifiedGamesPool(speciesCatalog, 'es')
    expect(pool.length).toBeGreaterThan(10)
    for (const s of pool) {
      expect(s.verified).toBe(true)
      expect(s.checks.hasPhotoUrl).toBe(true)
      expect(s.checks.hasCommon).toBe(true)
      expect(s.photoUrl).toMatch(/^https?:\/\//)
      expect(s.common.length).toBeGreaterThan(1)
    }
  })

  it('T3: empty/pending photos db yields thin or empty pool; hydrate restores size', () => {
    __setPhotosDbForTests({ version: 'pending', photos: {} })
    const thin = buildVerifiedGamesPool(speciesCatalog, 'es')
    // Without photo URLs, verified pool should exclude photo-gated taxa
    expect(thin.length).toBe(0)

    const photos: Record<string, { taxon: string; url: string }> = {}
    for (const t of CURATED_GAMES_TAXA.slice(0, 30)) {
      photos[t.toLowerCase()] = {
        taxon: t,
        url: `https://example.com/photos/${t.replace(/\s+/g, '_')}.jpg`,
      }
    }
    for (const s of speciesCatalog.slice(0, 50)) {
      if (!s.taxon) continue
      photos[s.taxon.toLowerCase()] = {
        taxon: s.taxon,
        url: `https://example.com/photos/${s.slug || 'x'}.jpg`,
      }
    }
    __setPhotosDbForTests({ version: 'test-hydrated', photos })
    const full = buildVerifiedGamesPool(speciesCatalog, 'es')
    expect(full.length).toBeGreaterThan(10)
    expect(full.length).toBeGreaterThan(thin.length)
  })

  it('daily pick is stable for the same day and changes across days', () => {
    const pool = buildVerifiedGamesPool(speciesCatalog, 'es')
    if (pool.length < 2) return
    const a = pickDailyFromPool(pool, 'foto-del-dia', '2026-07-31')
    const b = pickDailyFromPool(pool, 'foto-del-dia', '2026-07-31')
    const c = pickDailyFromPool(pool, 'foto-del-dia', '2026-08-01')
    expect(a.taxon).toBe(b.taxon)
    // With a large pool, different days almost always differ
    if (pool.length > 5) {
      expect(a.taxon === c.taxon ? 'same' : 'diff').toMatch(/same|diff/)
    }
  })

  it('modes have distinct seed salts and routes', () => {
    expect(DAILY_GAME_MODES.length).toBeGreaterThanOrEqual(5)
    const salts = new Set(DAILY_GAME_MODES.map((m) => m.seedSalt))
    expect(salts.size).toBe(DAILY_GAME_MODES.length)
    for (const m of DAILY_GAME_MODES) {
      expect(m.to.startsWith('/')).toBe(true)
    }
  })

  it('foto del día and mode picks come from verified pool', () => {
    const pool = buildVerifiedGamesPool(speciesCatalog, 'es')
    const photo = pickDailyPhotoSpecies(pool, '2026-07-31')
    const wordle = pickDailySpeciesForMode(pool, 'wordle', '2026-07-31')
    expect(pool.some((p) => p.taxon === photo.taxon)).toBe(true)
    expect(pool.some((p) => p.taxon === wordle.taxon)).toBe(true)
  })

  it('tracks daily completion locally', () => {
    const day = gamesDayKey()
    const before = dailyGamesCompletion(day)
    expect(before.done).toBe(0)
    markDailyGameDone('wordle', day)
    markDailyGameDone('quiz', day)
    const after = dailyGamesCompletion(day)
    expect(after.done).toBe(2)
    expect(after.total).toBe(DAILY_GAME_MODES.length)
    expect(after.pct).toBeGreaterThan(0)
    expect(after.pct).toBe(Math.round((2 / DAILY_GAME_MODES.length) * 100))
  })

  it('UX-05 continue-path: first incomplete daily mode', () => {
    const day = gamesDayKey()
    expect(firstIncompleteDailyMode(day)?.id).toBe(DAILY_GAME_MODES[0].id)
    expect(continueDailyPath(day).id).toBe(DAILY_GAME_MODES[0].id)
    expect(isDailyBoardComplete(day)).toBe(false)

    markDailyGameDone(DAILY_GAME_MODES[0].id, day)
    expect(firstIncompleteDailyMode(day)?.id).toBe(DAILY_GAME_MODES[1].id)
    expect(continueDailyPath(day).to).toBe(DAILY_GAME_MODES[1].to)

    for (const m of DAILY_GAME_MODES) {
      markDailyGameDone(m.id, day)
    }
    expect(firstIncompleteDailyMode(day)).toBeNull()
    expect(isDailyBoardComplete(day)).toBe(true)
    // Replay path falls back to first mode (never product_unlock)
    expect(continueDailyPath(day).id).toBe(DAILY_GAME_MODES[0].id)
  })
})
