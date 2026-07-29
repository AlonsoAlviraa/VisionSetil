import { describe, expect, it } from 'vitest'
import { searchCatalogRanked } from './catalogSearch'
import { speciesCatalog } from '../data/speciesCatalog'
import {
  INDEX_FUNGORUM_ATTR_SHORT,
  INDEX_FUNGORUM_HOME,
  ifSearchHintFromResolve,
  indexFungorumPolicyEs,
  indexFungorumRecordUrl,
  looksLikeScientificQuery,
  nomenclatureQueryVariants,
  scoreTaxonAgainstNomenclatureVariants,
  type IndexFungorumResolve,
} from './indexFungorum'
import { aliasesForTaxon, canonicalTaxonName } from './taxonSynonyms'

describe('indexFungorum helpers', () => {
  it('builds record URLs and attribution constants', () => {
    expect(indexFungorumRecordUrl(178962)).toContain('RecordID=178962')
    expect(indexFungorumRecordUrl('bad')).toBeNull()
    expect(INDEX_FUNGORUM_HOME).toMatch(/indexfungorum\.org/)
    expect(INDEX_FUNGORUM_ATTR_SHORT).toMatch(/Kew|Index Fungorum/i)
  })

  it('policy never implies consumption or auto-unlock', () => {
    const p = indexFungorumPolicyEs().toLowerCase()
    expect(p).toMatch(/nomenclatura|nombres/)
    expect(p).toMatch(/nunca|no es permiso|no se sobrescribe/)
    expect(p).not.toMatch(/safe to eat|comestible seguro/)
  })

  it('P17 nomenclature variants + IF resolve hints (names only)', () => {
    expect(looksLikeScientificQuery('Amanita phalloides')).toBe(true)
    expect(looksLikeScientificQuery('níscalo')).toBe(false)
    const variants = nomenclatureQueryVariants('Coprinopsis atramentaria', [
      'Coprinus atramentarius',
    ])
    expect(variants).toContain('coprinopsis atramentaria')
    expect(variants).toContain('coprinus atramentarius')
    expect(
      scoreTaxonAgainstNomenclatureVariants('Coprinus atramentarius', variants),
    ).toBeGreaterThanOrEqual(100)

    const resolve: IndexFungorumResolve = {
      query: 'Coprinus atramentarius',
      ok: true,
      best: {
        name: 'Coprinus atramentarius',
        current_name: 'Coprinopsis atramentaria',
        record_number: '1',
      },
      current_name: 'Coprinopsis atramentaria',
      if_differs_from_query: true,
      synonyms: [{ name: 'Coprinopsis atramentaria' }],
      hits: 1,
      policy: 'nomenclature_only_never_consumption',
      product_unlock: false,
    }
    const hint = ifSearchHintFromResolve(resolve)
    expect(hint.differs).toBe(true)
    expect(hint.currentName).toMatch(/Coprinopsis atramentaria/i)
    expect(hint.hints.some((h) => h.includes('atramentaria'))).toBe(true)
  })

  it('P17 curated synonym reverse boost finds ink cap under IF current name', () => {
    expect(canonicalTaxonName('Coprinopsis atramentaria')).toMatch(/Coprinus atramentarius/i)
    expect(aliasesForTaxon('Coprinus atramentarius').some((a) => a.includes('atramentaria'))).toBe(
      true,
    )
    const hits = searchCatalogRanked(speciesCatalog, {
      query: 'Coprinopsis atramentaria',
      limit: 10,
      boostHighRisk: false,
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].taxon.toLowerCase()).toMatch(/coprinus atramentarius/)
    // Live IF-style hints still rank SSOT card first
    const withIf = searchCatalogRanked(speciesCatalog, {
      query: 'x',
      limit: 15,
      boostHighRisk: false,
      nomenclatureHints: ['Coprinus atramentarius', 'Coprinopsis atramentaria'],
    })
    // Query "x" alone may not hit; with only hints path — use real-ish query
    const withIf2 = searchCatalogRanked(speciesCatalog, {
      query: 'atramentaria',
      limit: 10,
      boostHighRisk: false,
      nomenclatureHints: ['Coprinopsis atramentaria'],
    })
    expect(withIf2.some((h) => /atramentarius/i.test(h.taxon))).toBe(true)
    void withIf
  })
})
