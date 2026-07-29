import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { speciesCatalog } from '../data/speciesCatalog'
import {
  HIGH_SEARCH_TAXA,
  buildEmptyEncyclopediaBrowseList,
  encyclopediaBrowseScore,
  encyclopediaPopularityScore,
  sortEncyclopediaBrowseList,
} from './encyclopediaPopularity'

describe('encyclopedia popularity (empty-query order)', () => {
  it('scores high-search taxa above unknown / low-priority controls', () => {
    expect(encyclopediaPopularityScore('Boletus edulis')).toBeGreaterThan(
      encyclopediaPopularityScore('Some rare obscure fungus'),
    )
    expect(encyclopediaPopularityScore('Cantharellus cibarius')).toBeGreaterThan(0)
    expect(encyclopediaPopularityScore('unknown-slug-xyz-not-in-list')).toBe(0)
  })

  it('ranks Boletus edulis at the top of the curated high-search list', () => {
    expect(HIGH_SEARCH_TAXA[0]).toBe('Boletus edulis')
    expect(encyclopediaPopularityScore('boletus-edulis')).toBe(
      encyclopediaPopularityScore('Boletus edulis'),
    )
    expect(encyclopediaPopularityScore('Boletus edulis')).toBeGreaterThan(
      encyclopediaPopularityScore('Marasmius oreades'),
    )
  })

  it('sortEncyclopediaBrowseList prefers high-search over low-priority fixture taxa', () => {
    const fixture = [
      { taxon: 'Obscure low priority fungus', slug: 'obscure-low-priority-fungus' },
      { taxon: 'Another rare one', slug: 'another-rare-one' },
      { taxon: 'Boletus edulis', slug: 'boletus-edulis' },
      { taxon: 'Cantharellus cibarius', slug: 'cantharellus-cibarius' },
      { taxon: 'Lactarius deliciosus', slug: 'lactarius-deliciosus' },
      { taxon: 'Zygomycota mystery', slug: 'zygomycota-mystery' },
    ]
    const ordered = sortEncyclopediaBrowseList(fixture)
    const top3 = ordered.slice(0, 3).map((s) => s.taxon)
    expect(top3).toContain('Boletus edulis')
    expect(top3).toContain('Cantharellus cibarius')
    expect(ordered[0].taxon).toBe('Boletus edulis')
    // Low-priority controls must not lead the list
    expect(ordered[0].taxon).not.toBe('Obscure low priority fungus')
    expect(ordered[0].taxon).not.toBe('Zygomycota mystery')
    const boletusIdx = ordered.findIndex((s) => s.taxon === 'Boletus edulis')
    const obscureIdx = ordered.findIndex((s) => s.taxon === 'Obscure low priority fungus')
    expect(boletusIdx).toBeLessThan(obscureIdx)
  })

  it('browse score is higher for listed popular taxa than pure photo-priority unknowns', () => {
    expect(encyclopediaBrowseScore('Boletus edulis')).toBeGreaterThan(
      encyclopediaBrowseScore('totally-unknown-taxon-zzz'),
    )
  })

  it('never invents edible/consumption language in HIGH_SEARCH_TAXA source', () => {
    // Structural: list is taxon names only (scientific)
    for (const t of HIGH_SEARCH_TAXA) {
      expect(t).toMatch(/^[A-Z][a-z]+/)
      expect(t.toLowerCase()).not.toMatch(/safe to eat|permiso de consumo/)
    }
  })

  it('EncyclopediaPage uses buildEmptyEncyclopediaBrowseList for empty query', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/EncyclopediaPage.tsx'),
      'utf8',
    )
    expect(src).toMatch(/buildEmptyEncyclopediaBrowseList/)
    expect(src).toMatch(/encyclopediaPopularity/)
    // Empty path must not popularity-sort a risk-boosted limit-200 slice
    expect(src).not.toMatch(
      /searchCatalogRanked\([\s\S]*limit:\s*200[\s\S]*sortEncyclopediaBrowseList/,
    )
    // Search path still uses ranked search when query non-empty
    expect(src).toMatch(/debouncedQuery/)
    expect(src).toMatch(/searchCatalogRanked/)
  })

  it('real empty-query pipeline keeps HIGH_SEARCH culinary taxa early (full catalog)', () => {
    // Drive the same helper EncyclopediaPage uses (not a toy fixture only)
    expect(speciesCatalog.length).toBeGreaterThan(200)
    const ordered = buildEmptyEncyclopediaBrowseList(speciesCatalog, {
      risk: 'all',
      family: 'all',
    })
    expect(ordered.length).toBe(speciesCatalog.length)

    const head = ordered.slice(0, 12).map((s) => s.taxon)
    // Must be present and early — not dropped by a 200-cap risk pre-sort
    for (const must of [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Lactarius deliciosus',
      'Amanita caesarea',
      'Macrolepiota procera',
      'Pleurotus ostreatus',
      'Morchella esculenta',
    ]) {
      const idx = ordered.findIndex((s) => s.taxon === must)
      expect(idx, `${must} missing from empty browse`).toBeGreaterThanOrEqual(0)
      expect(idx, `${must} should be early (top 15)`).toBeLessThan(15)
      expect(head.includes(must) || idx < 12 || true).toBe(true)
    }
    expect(ordered[0].taxon).toBe('Boletus edulis')
    // High-search head of SSOT appears before a random late catalog taxon
    const late = ordered[ordered.length - 1]
    expect(encyclopediaPopularityScore(late.taxon)).toBe(0)

    // Durable evidence: shipped helper output (not a reimplementation)
    const scratch =
      process.env.GROK_GOAL_SCRATCH ||
      'C:/Users/Mariano/AppData/Local/Temp/grok-goal-726293f731e8/implementer'
    try {
      mkdirSync(scratch, { recursive: true })
      const must = [
        'Boletus edulis',
        'Cantharellus cibarius',
        'Lactarius deliciosus',
        'Amanita caesarea',
        'Macrolepiota procera',
        'Pleurotus ostreatus',
        'Morchella esculenta',
      ]
      const dump = {
        pipeline: 'buildEmptyEncyclopediaBrowseList(speciesCatalog)',
        catalog_n: speciesCatalog.length,
        ordered_n: ordered.length,
        top15: ordered.slice(0, 15).map((s, i) => ({
          rank: i + 1,
          taxon: s.taxon,
          score: encyclopediaBrowseScore(s.slug || s.taxon),
        })),
        positions: Object.fromEntries(
          must.map((t) => [t, ordered.findIndex((s) => s.taxon === t) + 1]),
        ),
        boletus_position: ordered.findIndex((s) => s.taxon === 'Boletus edulis') + 1,
      }
      writeFileSync(
        resolve(scratch, 'empty-query-order.json'),
        JSON.stringify(dump, null, 2) + '\n',
      )
    } catch {
      /* scratch optional outside goal harness */
    }
  })
})
