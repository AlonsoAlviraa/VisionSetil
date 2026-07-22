/**
 * Pure tests for photo tier assignment and image load policy (Week 1).
 * No React, no real network — drives shipped functions in photoTiers + speciesImageService.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENCYCLOPEDIA_FIRST_PAGE_SIZE,
  getPhotoTier,
  PHOTO_TIER_T0,
  PHOTO_TIER_T1,
  shouldAllowRemotePhotoResolve,
  shouldUseCatalogUrlOnGrid,
} from './photoTiers'
import { speciesCatalog, speciesCatalogMeta } from './speciesCatalog'
import {
  canAsyncRemoteResolve,
  clearSpeciesImageCache,
  resolveSpeciesImageAsync,
  resolveSpeciesImageSync,
  __remoteResolvers,
} from '../lib/speciesImageService'

describe('photo tiers (data)', () => {
  it('lists non-empty T0 hero and T1 known taxa', () => {
    expect(PHOTO_TIER_T0.length).toBeGreaterThanOrEqual(12)
    expect(PHOTO_TIER_T1.length).toBeGreaterThanOrEqual(40)
  })

  it('assigns T0 to iconic Iberian / education taxa', () => {
    expect(getPhotoTier('Amanita phalloides', 'deadly')).toBe('T0')
    expect(getPhotoTier('Boletus edulis')).toBe('T0')
    expect(getPhotoTier('Lactarius deliciosus')).toBe('T0')
    expect(getPhotoTier('Cantharellus cibarius')).toBe('T0')
  })

  it('assigns T1 to known Spain / listed taxa', () => {
    expect(getPhotoTier('Lepista nuda')).toBe('T1')
    expect(getPhotoTier('Marasmius oreades')).toBe('T1')
  })

  it('promotes high-risk taxa to at least T1 even if not listed', () => {
    // Unlisted binomial with deadly risk must not stay T2
    expect(getPhotoTier('Fakeus deadlyus', 'deadly')).toBe('T1')
    expect(getPhotoTier('Fakeus poisonus', 'poisonous')).toBe('T1')
    expect(getPhotoTier('Fakeus toxicus', 'toxic')).toBe('T1')
  })

  it('defaults unknown low-risk taxa to T2', () => {
    expect(getPhotoTier('Completely unknown fungus', 'unknown_or_risky')).toBe('T2')
    expect(getPhotoTier('Obscureus obscurissimus', 'dangerous_or_unknown')).toBe('T2')
  })

  it('attaches photo_tier to every catalog species', () => {
    expect(speciesCatalog.length).toBeGreaterThan(100)
    for (const s of speciesCatalog) {
      expect(['T0', 'T1', 'T2']).toContain(s.photo_tier)
      expect(s.photo_tier).toBe(getPhotoTier(s.taxon, s.risk_label))
    }
    expect(speciesCatalogMeta.photo_t0).toBeGreaterThanOrEqual(10)
    expect(speciesCatalogMeta.photo_t1).toBeGreaterThanOrEqual(20)
    expect(
      (speciesCatalogMeta.photo_t0 || 0) +
        (speciesCatalogMeta.photo_t1 || 0) +
        (speciesCatalogMeta.photo_t2 || 0),
    ).toBe(speciesCatalogMeta.count)
  })
})

describe('remote resolve policy', () => {
  it('forbids remote resolve on grid for all tiers', () => {
    expect(shouldAllowRemotePhotoResolve('T0', 'grid')).toBe(false)
    expect(shouldAllowRemotePhotoResolve('T1', 'grid')).toBe(false)
    expect(shouldAllowRemotePhotoResolve('T2', 'grid')).toBe(false)
  })

  it('allows remote resolve on detail/eager', () => {
    expect(shouldAllowRemotePhotoResolve('T2', 'detail')).toBe(true)
    expect(shouldAllowRemotePhotoResolve('T0', 'eager')).toBe(true)
  })

  it('only T0/T1 may use catalog URL on grid', () => {
    expect(shouldUseCatalogUrlOnGrid('T0')).toBe(true)
    expect(shouldUseCatalogUrlOnGrid('T1')).toBe(true)
    expect(shouldUseCatalogUrlOnGrid('T2')).toBe(false)
  })

  it('canAsyncRemoteResolve blocks grid even without catalog', () => {
    expect(
      canAsyncRemoteResolve({
        tier: 'T0',
        context: 'grid',
        alreadyCatalog: false,
      }),
    ).toBe(false)
    expect(
      canAsyncRemoteResolve({
        tier: 'T2',
        context: 'grid',
        alreadyCatalog: false,
      }),
    ).toBe(false)
  })

  it('encyclopedia first page size is bounded to ≤16', () => {
    expect(ENCYCLOPEDIA_FIRST_PAGE_SIZE).toBeLessThanOrEqual(16)
    expect(ENCYCLOPEDIA_FIRST_PAGE_SIZE).toBeGreaterThan(0)
  })
})

describe('resolveSpeciesImageSync grid policy', () => {
  afterEach(() => {
    clearSpeciesImageCache()
  })

  it('T2 grid always returns placeholder provider (no catalog URL leak)', () => {
    // Pick a T2 species from catalog if any
    const t2 = speciesCatalog.find((s) => s.photo_tier === 'T2')
    expect(t2).toBeTruthy()
    const resolved = resolveSpeciesImageSync(t2!.taxon, {
      riskLabel: t2!.risk_label,
      context: 'grid',
      tier: 'T2',
    })
    expect(resolved.provider).toBe('placeholder')
    expect(resolved.url.startsWith('data:image/svg+xml')).toBe(true)
    expect(resolved.tier).toBe('T2')
  })

  it('T0 grid may use catalog when photo exists', () => {
    const resolved = resolveSpeciesImageSync('Amanita phalloides', {
      riskLabel: 'deadly',
      context: 'grid',
      tier: 'T0',
    })
    // Catalog has many T0 entries; if present must be catalog, else placeholder
    expect(['catalog', 'placeholder']).toContain(resolved.provider)
    if (resolved.provider === 'catalog') {
      expect(resolved.url.startsWith('http')).toBe(true)
    }
  })
})

describe('resolveSpeciesImageAsync no-network on T2 grid', () => {
  let wikiSpy: ReturnType<typeof vi.fn>
  let inatSpy: ReturnType<typeof vi.fn>
  const origWiki = __remoteResolvers.fetchWiki
  const origInat = __remoteResolvers.fetchInat

  beforeEach(() => {
    clearSpeciesImageCache()
    wikiSpy = vi.fn(async () => 'https://example.com/wiki.jpg')
    inatSpy = vi.fn(async () => 'https://example.com/inat.jpg')
    __remoteResolvers.fetchWiki = wikiSpy as typeof __remoteResolvers.fetchWiki
    __remoteResolvers.fetchInat = inatSpy as typeof __remoteResolvers.fetchInat
    __remoteResolvers.enabled = true
  })

  afterEach(() => {
    __remoteResolvers.fetchWiki = origWiki
    __remoteResolvers.fetchInat = origInat
    clearSpeciesImageCache()
  })

  it('does not call wiki/iNat for T2 grid path', async () => {
    const t2 = speciesCatalog.find((s) => s.photo_tier === 'T2')!
    const r = await resolveSpeciesImageAsync(t2.taxon, {
      riskLabel: t2.risk_label,
      context: 'grid',
      tier: 'T2',
    })
    expect(wikiSpy).not.toHaveBeenCalled()
    expect(inatSpy).not.toHaveBeenCalled()
    expect(r.provider).toBe('placeholder')
  })

  it('does not call wiki/iNat for T0/T1 grid path either', async () => {
    const r = await resolveSpeciesImageAsync('Amanita muscaria', {
      riskLabel: 'poisonous',
      context: 'grid',
      tier: 'T0',
    })
    expect(wikiSpy).not.toHaveBeenCalled()
    expect(inatSpy).not.toHaveBeenCalled()
    // May be catalog or placeholder, never wikipedia from this path
    expect(r.provider).not.toBe('wikipedia')
    expect(r.provider).not.toBe('inaturalist')
  })

  it('detail path may call remote when not in catalog', async () => {
    const r = await resolveSpeciesImageAsync('Totally Fake Taxon Xyz', {
      riskLabel: 'unknown_or_risky',
      context: 'detail',
      tier: 'T2',
    })
    expect(wikiSpy).toHaveBeenCalled()
    expect(r.provider).toBe('wikipedia')
    expect(r.url).toContain('example.com')
  })
})
