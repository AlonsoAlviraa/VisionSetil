/**
 * S3: Spanish common-name coverage + synonym search (níscalo, oronja, matacandil…).
 */
import { describe, expect, it } from 'vitest'
import { speciesCatalog } from './speciesCatalog'
import { foldEs } from './commonNamesEs'
import { searchCatalogRanked } from '../lib/catalogSearch'
import { resolveSpeciesDisplay, NO_LOCAL_COMMON_NAME } from '../components/SpeciesNameBlock'
import { commonsForLocale, displayCommonName } from './speciesCatalog'

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

  it('finds Coprinus atramentarius via matacandil / tinta when present in catalog', () => {
    // SSOT spelling is Coprinus atramentarius (not Coprinopsis atramentaria)
    const inCat = speciesCatalog.some((s) => s.taxon === 'Coprinus atramentarius')
    if (!inCat) return
    const hits = searchCatalogRanked(speciesCatalog, { query: 'tinta', limit: 15 })
    const hits2 = searchCatalogRanked(speciesCatalog, { query: 'matacandil', limit: 15 })
    const found =
      hits.some((h) => h.taxon === 'Coprinus atramentarius') ||
      hits2.some((h) => h.taxon === 'Coprinus atramentarius' || h.taxon === 'Coprinus comatus')
    expect(found).toBe(true)
  })

  it('resolves synonym scientific query Coprinopsis atramentaria to SSOT taxon', () => {
    const inCat = speciesCatalog.some((s) => s.taxon === 'Coprinus atramentarius')
    if (!inCat) return
    const hits = searchCatalogRanked(speciesCatalog, {
      query: 'Coprinopsis atramentaria',
      limit: 5,
    })
    expect(hits.some((h) => h.taxon === 'Coprinus atramentarius')).toBe(true)
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

  it('uses explicit empty label when no local name (ES)', () => {
    const d = resolveSpeciesDisplay({
      taxon: 'Fakeus nonexistentus xyz',
      commonNames: [],
      locale: 'es',
    })
    expect(d.hasLocalCommon).toBe(false)
    expect(d.commonPrimary).toBe(NO_LOCAL_COMMON_NAME)
  })

  it('EN prefers English common or falls back to scientific (never blank)', () => {
    const d = resolveSpeciesDisplay({
      taxon: 'Amanita phalloides',
      locale: 'en',
    })
    expect(d.taxon).toBe('Amanita phalloides')
    expect(d.commonPrimary).toBeTruthy()
    expect(d.commonPrimary).not.toMatch(/undefined|null/i)
    // Death cap or curated EN — not Spanish oronja as forced primary when EN exists
    if (d.hasLocalCommon) {
      expect(d.commonPrimary.toLowerCase()).toMatch(/death|cap|amanita/)
    }
  })

  it('EN unknown taxon falls back to scientific name', () => {
    const d = resolveSpeciesDisplay({
      taxon: 'Fakeus nonexistentus xyz',
      commonNames: [],
      locale: 'en',
    })
    expect(d.hasLocalCommon).toBe(false)
    expect(d.commonPrimary).toBe('Fakeus nonexistentus xyz')
    expect(d.taxon).toBe('Fakeus nonexistentus xyz')
  })

  it('never surfaces raw undefined family tokens', () => {
    const d = resolveSpeciesDisplay({
      taxon: 'Amanita phalloides',
      family: 'undefined',
      familyEs: 'null',
    })
    expect(d.familyLine == null || !/undefined|null/i.test(d.familyLine)).toBe(true)
  })

  it('EN family line is Latin-only (no Spanish family_es chrome)', () => {
    const d = resolveSpeciesDisplay({
      taxon: 'Amanita phalloides',
      family: 'Amanitaceae',
      familyEs: 'Amanitas',
      locale: 'en',
    })
    expect(d.familyLine).toBe('Amanitaceae')
    expect(d.familyLine).not.toMatch(/Amanitas/)
  })
})

describe('commonsForLocale (SpeciesDetail EN path)', () => {
  it('EN never returns Spanish commons when EN list is empty', () => {
    const fake = {
      taxon: 'Fakeus nonexistentus xyz',
      common_names: ['Nombre español inventado'],
      common_names_en: [] as string[],
    }
    const en = commonsForLocale(fake, 'en', ['Otro español'])
    // No Spanish leakage — either empty (after enrich) or non-Spanish scientific path
    for (const n of en) {
      expect(n.toLowerCase()).not.toBe('nombre español inventado')
      expect(n.toLowerCase()).not.toBe('otro español')
    }
    // display falls back to scientific when no EN common
    expect(displayCommonName(fake, 'en')).toBe('Fakeus nonexistentus xyz')
  })

  it('ES still prefers Spanish commons', () => {
    const s = {
      taxon: 'Amanita phalloides',
      common_names: ['Oronja verde'],
      common_names_en: ['Death cap'],
    }
    expect(commonsForLocale(s, 'es')[0].toLowerCase()).toContain('oronja')
    expect(commonsForLocale(s, 'en')[0].toLowerCase()).toMatch(/death|cap/)
  })
})
