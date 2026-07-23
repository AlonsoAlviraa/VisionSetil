/**
 * S5 offline pack + catalog index pure tests (no Cache API required).
 * Phase D-14: season pack entries.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildCatalogIndex,
  buildOfflinePackEntries,
  buildSeasonOfflinePackEntries,
  offlinePackPhotoUrls,
  normalizeOfflineUrl,
} from './offlinePack'
import { PHOTO_TIER_T0 } from '../data/photoTiers'
import { loadSpeciesCatalog } from '../data/speciesCatalog'

beforeAll(async () => {
  await loadSpeciesCatalog()
})

describe('offline pack', () => {
  it('includes T0 iconic taxa first and only T0/T1', () => {
    const pack = buildOfflinePackEntries(80)
    expect(pack.length).toBeGreaterThan(20)
    expect(pack.length).toBeLessThanOrEqual(80)
    expect(pack.every((e) => e.photo_tier === 'T0' || e.photo_tier === 'T1')).toBe(true)
    // First entries should be T0 when present in catalog
    const firstTaxa = pack.slice(0, 5).map((e) => e.taxon.toLowerCase())
    const t0 = PHOTO_TIER_T0.map((t) => t.toLowerCase())
    expect(firstTaxa.some((t) => t0.includes(t))).toBe(true)
  })

  it('exposes common name + family without consumption language', () => {
    const pack = buildOfflinePackEntries(30)
    for (const e of pack) {
      expect(e.common_name.length).toBeGreaterThan(0)
      expect(e.common_name.toLowerCase()).not.toMatch(/safe to eat|segura para comer/)
    }
  })

  it('collects same-origin or http photo urls', () => {
    const urls = offlinePackPhotoUrls(buildOfflinePackEntries(50))
    for (const u of urls) {
      expect(u.startsWith('http') || u.startsWith('/media/') || u.startsWith('data:')).toBe(true)
    }
  })

  it('builds season pack entries with media urls', () => {
    const season = buildSeasonOfflinePackEntries('otono', 12)
    expect(season.length).toBeGreaterThan(0)
    expect(season.length).toBeLessThanOrEqual(12)
    for (const e of season) {
      expect(e.taxon.length).toBeGreaterThan(0)
      expect(e.slug.length).toBeGreaterThan(0)
      expect(e.photo_url).toBeTruthy()
    }
  })

  it('normalizes relative media paths when window origin exists', () => {
    const rel = normalizeOfflineUrl('/media/placeholders/default.webp')
    // In node test env, window may be undefined → keep relative
    expect(rel === '/media/placeholders/default.webp' || rel.startsWith('http')).toBe(true)
  })
})

describe('catalog index', () => {
  it('builds lightweight rows without photo blobs', () => {
    const idx = buildCatalogIndex(20)
    expect(idx.length).toBe(20)
    expect(idx[0].taxon).toBeTruthy()
    expect(idx[0].slug).toBeTruthy()
    expect(Array.isArray(idx[0].common_names)).toBe(true)
    // no photo_url field on index rows
    expect('photo_url' in idx[0]).toBe(false)
  })
})
