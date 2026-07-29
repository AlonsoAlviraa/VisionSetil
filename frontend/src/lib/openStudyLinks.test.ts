import { describe, expect, it } from 'vitest'
import {
  WORLD_MUSHROOM_RESOURCES,
  gbifSpeciesSearchUrl,
  inaturalistTaxonSearchUrl,
  openStudyLinksForTaxon,
  wikipediaSpeciesUrl,
} from './openStudyLinks'

describe('openStudyLinks', () => {
  it('builds wikipedia + iNat + GBIF for a taxon', () => {
    const links = openStudyLinksForTaxon('Amanita phalloides', 'es')
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.id)).toEqual(['wikipedia', 'inaturalist', 'gbif'])
    expect(links[0].href).toContain('wikipedia.org')
    expect(links[1].href).toContain('inaturalist.org')
    expect(links[2].href).toContain('gbif.org')
  })

  it('returns empty for blank taxon', () => {
    expect(openStudyLinksForTaxon('')).toEqual([])
  })

  it('encodes scientific names safely', () => {
    expect(wikipediaSpeciesUrl('Boletus edulis', 'en')).toMatch(
      /Boletus_edulis/,
    )
    expect(inaturalistTaxonSearchUrl('Cantharellus cibarius')).toMatch(
      /Cantharellus/,
    )
    expect(gbifSpeciesSearchUrl('Amanita muscaria')).toMatch(/Amanita/)
  })

  it('ships curated world resource list (top educational sites)', () => {
    expect(WORLD_MUSHROOM_RESOURCES.length).toBeGreaterThanOrEqual(8)
    const names = WORLD_MUSHROOM_RESOURCES.map((r) => r.name.toLowerCase()).join(' ')
    expect(names).toMatch(/inaturalist/)
    expect(names).toMatch(/first nature|mushroomexpert|gbif|index fungorum/)
    for (const r of WORLD_MUSHROOM_RESOURCES) {
      expect(r.href.startsWith('https://')).toBe(true)
      expect(r.blurbEs.length).toBeGreaterThan(8)
    }
  })
})
