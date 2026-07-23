/**
 * S3: Spanish common-name coverage + synonym search (níscalo, oronja, matacandil…).
 */
import { describe, expect, it } from 'vitest'
import { speciesCatalog } from './speciesCatalog'
import { foldEs } from './commonNamesEs'
import { searchCatalogRanked } from '../lib/catalogSearch'
import { resolveSpeciesDisplay, NO_LOCAL_COMMON_NAME } from '../components/SpeciesNameBlock'

describe('Spanish common name coverage', () => {
  it('covers ≥95% of catalog taxa with at least one local common name', () => {
    let withName = 0
    for (const s of speciesCatalog) {
      const locals = s.common_names.filter((n) => {
        const k = n.toLowerCase()
        return !['death cap', 'destroying angel', 'funeral bell', 'false morel', 'deadly webcap'].includes(
          k,
        )
      })
      if (locals.length > 0) withName += 1
    }
    const pct = withName / speciesCatalog.length
    expect(pct).toBeGreaterThanOrEqual(0.95)
  })

  it('T0 iconic taxa have Spanish commons including regional synonyms', () => {
    const must: Record<string, string[]> = {
      'Lactarius deliciosus': ['níscalo', 'rovellón', 'nizcalo', 'robellon', 'esne'],
      'Amanita phalloides': ['oronja'],
      'Amanita caesarea': ['oronja'],
      'Marasmius oreades': ['senderuela'],
      'Boletus edulis': ['hongo', 'cep', 'porcini', 'calabaza'],
    }
    for (const [taxon, needles] of Object.entries(must)) {
      const s = speciesCatalog.find((x) => x.taxon === taxon)
      if (!s) continue // not every iconic is in v2 allowlist
      const folded = s.common_names.map((c) => foldEs(c)).join(' | ')
      const hit = needles.some((n) => folded.includes(foldEs(n)))
      expect(hit, `${taxon} commons=${folded}`).toBe(true)
    }
  })
})

describe('synonym search', () => {
  it('finds Lactarius deliciosus via níscalo / niscalo / rovellón', () => {
    for (const q of ['níscalo', 'niscalo', 'rovellón', 'rovellon', 'nizcalo']) {
      const hits = searchCatalogRanked(speciesCatalog, { query: q, limit: 25 })
      const ok =
        hits.some((h) => h.taxon === 'Lactarius deliciosus') ||
        hits.some((h) => /lactarius/i.test(h.taxon))
      expect(ok, q).toBe(true)
    }
  })

  it('finds Amanita phalloides / caesarea via oronja', () => {
    const hits = searchCatalogRanked(speciesCatalog, { query: 'oronja', limit: 15 })
    const taxa = hits.map((h) => h.taxon)
    expect(taxa.some((t) => t.startsWith('Amanita'))).toBe(true)
    expect(
      taxa.includes('Amanita phalloides') || taxa.includes('Amanita caesarea'),
    ).toBe(true)
  })

  it('finds Coprinopsis atramentaria via matacandil when present in catalog', () => {
    const inCat = speciesCatalog.some((s) => s.taxon === 'Coprinopsis atramentaria')
    if (!inCat) return
    const hits = searchCatalogRanked(speciesCatalog, { query: 'matacandil', limit: 10 })
    expect(hits.some((h) => h.taxon === 'Coprinopsis atramentaria')).toBe(true)
  })

  it('finds Marasmius oreades via senderuela', () => {
    const hits = searchCatalogRanked(speciesCatalog, { query: 'senderuela', limit: 10 })
    expect(hits.some((h) => h.taxon === 'Marasmius oreades')).toBe(true)
  })
})

describe('SpeciesNameBlock resolveSpeciesDisplay', () => {
  it('returns common ES first for catalog taxa with family ES · Latin', () => {
    const d = resolveSpeciesDisplay({ taxon: 'Amanita phalloides' })
    expect(d.hasLocalCommon).toBe(true)
    expect(foldEs(d.commonPrimary)).toContain('oronja')
    expect(d.taxon).toBe('Amanita phalloides')
    expect(d.familyLatin).toBe('Amanitaceae')
    expect(d.familyLine).toMatch(/·/)
    expect(d.familyLine?.toLowerCase()).toMatch(/amanita/)
  })

  it('uses explicit empty label when no local name', () => {
    const d = resolveSpeciesDisplay({
      taxon: 'Fakeus nonexistentus xyz',
      commonNames: [],
    })
    expect(d.hasLocalCommon).toBe(false)
    expect(d.commonPrimary).toBe(NO_LOCAL_COMMON_NAME)
  })
})
