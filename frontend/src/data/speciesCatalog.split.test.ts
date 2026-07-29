/**
 * Catalog code-split: loadSpeciesCatalog is the shipped entry.
 * D1: SSOT v2 → 520 unique slugs (species_catalog_snapshot / species_catalog_v2).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CANONICAL_RISK_LABELS,
  displayCommonName,
  getSpeciesBySlug,
  getSpeciesByTaxon,
  isCatalogLoaded,
  loadSpeciesCatalog,
  riskFromV2,
  searchSpecies,
  speciesCatalog,
  speciesCatalogMeta,
} from './speciesCatalog'
import { scientificNameToSlug } from '../lib/slug'
import { searchCatalogRanked } from '../lib/catalogSearch'
import expandedJson from './speciesCatalog.json'

/** Expected SSOT size from data/species_catalog/species_catalog_v2.json */
const SSOT_COUNT = 520
const CANONICAL = new Set<string>(CANONICAL_RISK_LABELS)

describe('speciesCatalog code-split loader', () => {
  beforeAll(async () => {
    await loadSpeciesCatalog()
  })

  it('loads SSOT-scale catalog (520) via dynamic import path', async () => {
    const list = await loadSpeciesCatalog()
    expect(list.length).toBe(SSOT_COUNT)
    expect(isCatalogLoaded()).toBe(true)
    expect(speciesCatalog.length).toBe(list.length)
    expect(speciesCatalogMeta.count).toBe(list.length)
    expect(speciesCatalogMeta.loaded).toBe(true)
    expect(speciesCatalogMeta.policy).toMatch(/orientation_only/)
  })

  it('has unique slugs for every taxon', async () => {
    const list = await loadSpeciesCatalog()
    const slugs = list.map((s) => s.slug)
    expect(slugs.every((s) => Boolean(s))).toBe(true)
    expect(new Set(slugs).size).toBe(list.length)
    expect(new Set(slugs).size).toBe(SSOT_COUNT)
  })

  it('uses canonical risk_label set (SSOT parity with expanded JSON)', async () => {
    const list = await loadSpeciesCatalog()
    for (const s of list) {
      expect(CANONICAL.has(s.risk_label), `${s.slug} risk=${s.risk_label}`).toBe(true)
      // Never raw culinary praise on risk_label
      expect(s.risk_label.toLowerCase()).not.toMatch(/edible|excelente|comestible/)
    }
    // Parity: runtime snapshot hydrate vs regenerated CatalogSpecies JSON
    const expanded = expandedJson as { species: Array<{ slug: string; risk_label: string }> }
    expect(expanded.species.length).toBe(SSOT_COUNT)
    const bySlug = new Map(expanded.species.map((r) => [r.slug, r.risk_label]))
    for (const s of list) {
      expect(bySlug.get(s.slug), s.slug).toBe(s.risk_label)
    }
    // Encyclopedia filter buckets must be non-empty for SSOT keys
    const counts = list.reduce<Record<string, number>>((acc, s) => {
      acc[s.risk_label] = (acc[s.risk_label] || 0) + 1
      return acc
    }, {})
    expect(counts.deadly).toBeGreaterThan(0)
    expect(counts.toxic).toBeGreaterThan(0)
    expect(counts.unknown_or_risky).toBeGreaterThan(0)
    expect(counts.dangerous_or_unknown).toBeGreaterThan(0)
  })

  it('riskFromV2 matches sync_catalog_ssot mapping', () => {
    expect(riskFromV2('deadly', 'mortifero')).toBe('deadly')
    expect(riskFromV2('high', 'toxico')).toBe('toxic')
    expect(riskFromV2('risky_lookalikes', 'comestible_con_cautela')).toBe('unknown_or_risky')
    expect(riskFromV2('medium', 'no_recomendado')).toBe('dangerous_or_unknown')
    expect(riskFromV2('low', 'excelente')).toBe('unknown_or_risky')
    expect(riskFromV2('unknown', 'desconocido')).toBe('dangerous_or_unknown')
  })

  it('includes P0 mortal taxa', async () => {
    const list = await loadSpeciesCatalog()
    const bySlug = new Set(list.map((s) => s.slug))
    for (const slug of [
      'amanita-phalloides',
      'amanita-verna',
      'amanita-virosa',
      'galerina-marginata',
      'cortinarius-orellanus',
    ]) {
      expect(bySlug.has(slug)).toBe(true)
    }
    const phallo = list.find((s) => s.slug === 'amanita-phalloides')
    expect(phallo?.risk_label).toBe('deadly')
  })

  it('search still works after async load', () => {
    const hits = searchSpecies('amanita', 10)
    expect(hits.length).toBeGreaterThan(0)
    const ranked = searchCatalogRanked(speciesCatalog, { query: 'níscalo', limit: 5 })
    expect(ranked.length).toBeGreaterThan(0)
  })

  it('slug ↔ taxon round-trips without broken names', async () => {
    const list = await loadSpeciesCatalog()
    const phallo = list.find((s) => s.taxon === 'Amanita phalloides')
    expect(phallo).toBeTruthy()
    expect(getSpeciesBySlug(phallo!.slug)?.taxon).toBe('Amanita phalloides')
    expect(getSpeciesBySlug(scientificNameToSlug('Amanita phalloides'))?.taxon).toBe(
      'Amanita phalloides',
    )
    expect(getSpeciesBySlug('Amanita phalloides')?.taxon).toBe('Amanita phalloides')
    // Synonym slug / taxon → SSOT
    expect(getSpeciesBySlug('coprinopsis-atramentaria')?.taxon).toBe('Coprinus atramentarius')
    expect(getSpeciesByTaxon('Coprinopsis atramentaria')?.taxon).toBe('Coprinus atramentarius')
    // SSOT lookalikes wired into FE catalog (encyclopedia ficha tab depends on this)
    expect(Array.isArray(phallo!.lookalikes)).toBe(true)
    expect((phallo!.lookalikes || []).length).toBeGreaterThan(0)
    expect((phallo!.lookalikes || []).some((n) => /citrina|caesarea|vaginata/i.test(n))).toBe(
      true,
    )
    // Multi-word + no blank common display
    for (const s of list.slice(0, 40)) {
      expect(s.taxon).toBeTruthy()
      expect(s.taxon).not.toMatch(/undefined|null/i)
      expect(s.slug).toBe(scientificNameToSlug(s.taxon) || s.slug)
      expect(displayCommonName(s, 'es')).toBeTruthy()
      expect(displayCommonName(s, 'en')).toBeTruthy()
      expect(displayCommonName(s, 'en')).not.toMatch(/undefined|null/i)
    }
    // EN death cap when available
    const enName = displayCommonName(phallo!, 'en')
    expect(enName.toLowerCase()).toMatch(/death|cap|amanita phalloides/)
  })

  it('idempotent second load returns same length', async () => {
    const a = await loadSpeciesCatalog()
    const b = await loadSpeciesCatalog()
    expect(a.length).toBe(b.length)
    expect(a.length).toBe(SSOT_COUNT)
  })
})
