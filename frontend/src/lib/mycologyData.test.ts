/**
 * Real-path tests for family enrichment, Spanish family names, and photo resolve.
 */
import { describe, expect, it } from 'vitest'
import { familyForTaxon } from '../data/genusFamilyMap'
import { FAMILY_NAMES_ES, familyNameEs, knownFamilyLatins } from '../data/familyNamesEs'
import {
  familyCoverageStats,
  speciesCatalog,
} from '../data/speciesCatalog'
import { listFamilies, searchCatalogRanked } from './catalogSearch'
import {
  catalogPhotoStats,
  resolveSpeciesImageSync,
} from './speciesImageService'
import { mycologyPlaceholderDataUri } from '../data/mycologyPlaceholder'
import { speciesPhotoErrorFallback } from './speciesPhotoFallback'

describe('family enrichment', () => {
  it('covers almost all catalog taxa with a scientific family', () => {
    const stats = familyCoverageStats()
    expect(stats.total).toBe(speciesCatalog.length)
    expect(stats.with_family).toBe(stats.total)
    expect(stats.without_family).toBe(0)
    // Baseline was ~143/347; we require full practical coverage
    expect(stats.with_family / stats.total).toBeGreaterThanOrEqual(0.95)
  })

  it('familyForTaxon fills missing families from genus map', () => {
    expect(familyForTaxon('Amanita phalloides', null)).toBe('Amanitaceae')
    expect(familyForTaxon('Boletus edulis', null)).toBe('Boletaceae')
    expect(familyForTaxon('Russula emetica', 'Russulaceae')).toBe('Russulaceae')
  })
})

describe('Spanish family names', () => {
  it('maps every family present in the catalog to a Spanish label', () => {
    const latinInCatalog = new Set(
      speciesCatalog.map((s) => s.family).filter((f): f is string => Boolean(f)),
    )
    const missingEs: string[] = []
    for (const latin of latinInCatalog) {
      const es = familyNameEs(latin)
      if (!es || es === latin || es === 'Sin familia') {
        // allow only if explicitly in map with same string (shouldn't happen)
        if (!(latin in FAMILY_NAMES_ES)) missingEs.push(latin)
      }
    }
    expect(missingEs).toEqual([])
    expect(knownFamilyLatins().length).toBeGreaterThan(50)
  })

  it('exposes family_es on enriched catalog entries', () => {
    const amanita = speciesCatalog.find((s) => s.taxon === 'Amanita phalloides')
    expect(amanita?.family).toBe('Amanitaceae')
    expect(amanita?.family_es?.toLowerCase()).toMatch(/amanita/)
    const stats = familyCoverageStats()
    expect(stats.with_family_es).toBe(stats.with_family)
  })

  it('listFamilies returns Spanish names for UI chips', () => {
    const fams = listFamilies(speciesCatalog)
    const am = fams.find((f) => f.family === 'Amanitaceae')
    expect(am).toBeTruthy()
    expect(am!.family_es.toLowerCase()).toMatch(/amanita/)
    expect(am!.count).toBeGreaterThan(0)
  })
})

describe('photos mycology catalog', () => {
  it('has verified photos for nearly all taxa', () => {
    const stats = catalogPhotoStats()
    expect(stats.mapped).toBeGreaterThanOrEqual(340)
    expect(stats.mapped / (stats.total || speciesCatalog.length)).toBeGreaterThanOrEqual(0.97)
  })

  it('resolveSpeciesImageSync returns non-empty URL for every catalog taxon', () => {
    let empty = 0
    for (const s of speciesCatalog) {
      const r = resolveSpeciesImageSync(s.taxon, s.risk_label)
      if (!r.url || r.url.length < 10) empty += 1
    }
    expect(empty).toBe(0)
  })

  it('iconic taxa use remote mycology sources when in catalog', () => {
    const r = resolveSpeciesImageSync('Amanita phalloides', 'deadly')
    expect(r.provider).toBe('catalog')
    expect(r.url).toMatch(/wikimedia|inaturalist|amazonaws|static\.inaturalist/i)
  })

  it('unknown taxa fall back to SVG mushroom placeholder', () => {
    const r = resolveSpeciesImageSync('Fakeus nonexistentus', 'deadly')
    expect(r.provider).toBe('placeholder')
    expect(r.url.startsWith('data:image/svg+xml')).toBe(true)
    expect(mycologyPlaceholderDataUri('Fakeus nonexistentus')).toMatch(/^data:image\/svg\+xml/)
  })

  it('speciesPhotoErrorFallback (detail/card onError) is SVG seta, never empty remote', () => {
    const fb = speciesPhotoErrorFallback('Amanita phalloides', 'deadly')
    expect(fb.startsWith('data:image/svg+xml')).toBe(true)
    expect(fb.length).toBeGreaterThan(40)
    // Must not return a http URL that could be the same broken remote
    expect(fb.startsWith('http')).toBe(false)
    const empty = speciesPhotoErrorFallback('', null)
    expect(empty.startsWith('data:image/svg+xml')).toBe(true)
  })
})

describe('encyclopedia family filter', () => {
  it('filters by Amanitaceae via searchCatalogRanked', () => {
    const hits = searchCatalogRanked(speciesCatalog, { family: 'Amanitaceae', limit: 100 })
    expect(hits.length).toBeGreaterThan(3)
    expect(hits.every((s) => s.family === 'Amanitaceae')).toBe(true)
  })

  it('finds family via Spanish query fragment', () => {
    const hits = searchCatalogRanked(speciesCatalog, { query: 'boletos', limit: 40 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((s) => (s.family || '') === 'Boletaceae')).toBe(true)
  })
})
