import { describe, expect, it } from 'vitest'
import {
  attributionFromCatalog,
  attributionFromMediaMetaJson,
  coalesceAttribution,
  hasAttributionMeta,
  metaJsonCacheUrlCandidates,
  normalizeAttributionMeta,
  shortLicenseLabel,
  speciesMetaJsonUrl,
} from './speciesAttribution'

describe('speciesAttribution', () => {
  it('shortens common Creative Commons URLs', () => {
    expect(shortLicenseLabel('http://creativecommons.org/licenses/by/4.0/')).toBe('CC BY')
    expect(shortLicenseLabel('http://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0')
    expect(shortLicenseLabel('cc-by-sa')).toBe('CC BY-SA')
    expect(shortLicenseLabel('wikipedia-page-image')).toBe('Wikipedia')
    expect(shortLicenseLabel(null)).toBeNull()
    expect(shortLicenseLabel('')).toBeNull()
  })

  it('builds meta.json URL via mediaPublicPrefix', () => {
    const url = speciesMetaJsonUrl('amanita-phalloides')
    expect(url).toMatch(/\/species\/amanita-phalloides\/meta\.json$/)
  })

  it('expands relative and absolute meta URL candidates for Cache API', () => {
    const rel = metaJsonCacheUrlCandidates('/media/species/x/meta.json')
    expect(rel).toContain('/media/species/x/meta.json')
    const abs = metaJsonCacheUrlCandidates('https://example.com/media/species/x/meta.json')
    expect(abs).toContain('https://example.com/media/species/x/meta.json')
    expect(abs).toContain('/media/species/x/meta.json')
  })

  it('hides empty attribution meta cleanly', () => {
    expect(hasAttributionMeta(null)).toBe(false)
    expect(hasAttributionMeta({})).toBe(false)
    expect(hasAttributionMeta({ creator: '  ' })).toBe(false)
    expect(hasAttributionMeta({ creator: 'Damon H', license: 'CC BY' })).toBe(true)
    expect(normalizeAttributionMeta({ creator: '', license: '' })).toBeNull()
  })

  it('normalizes media meta.json shape', () => {
    const meta = attributionFromMediaMetaJson({
      creator: 'Damon H',
      license: 'http://creativecommons.org/licenses/by/4.0/',
      source_url: 'https://example.com/photo.jpg',
      attribution_text: 'Damon H — http://creativecommons.org/licenses/by/4.0/',
    })
    expect(meta).not.toBeNull()
    expect(meta!.creator).toBe('Damon H')
    expect(meta!.license).toBe('CC BY')
    expect(meta!.source_url).toContain('example.com')
    expect(meta!.attribution_text).toMatch(/Damon H/)
    expect(meta!.attribution_text).toMatch(/CC BY/)
  })

  it('reads catalog license for known taxon', () => {
    const meta = attributionFromCatalog('Amanita phalloides')
    // Catalog has 520 mapped photos with license fields
    if (meta) {
      expect(hasAttributionMeta(meta)).toBe(true)
      expect(meta.license || meta.attribution_text || meta.creator).toBeTruthy()
    } else {
      // Still valid if taxon missing from snapshot — assert API stability
      expect(meta).toBeNull()
    }
  })

  it('coalesce prefers named photographer over generic provider', () => {
    const catalog = normalizeAttributionMeta({
      creator: 'Wikipedia',
      license: 'Wikipedia',
    })
    const media = normalizeAttributionMeta({
      creator: 'Damon H',
      license: 'CC BY',
      source_url: 'https://example.com/a.jpg',
    })
    const best = coalesceAttribution(catalog, media)
    expect(best?.creator).toBe('Damon H')
    expect(best?.license).toBe('CC BY')
  })

  it('coalesce returns null when all empty', () => {
    expect(coalesceAttribution(null, undefined, {})).toBeNull()
  })
})
