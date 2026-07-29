import { describe, expect, it } from 'vitest'
import {
  countByStudyTrait,
  filterByStudyTrait,
  matchesStudyTrait,
  STUDY_TRAIT_OPTIONS,
  STUDY_TRAIT_POLICY_ES,
  studyTraitForSpecies,
} from './studyTraits'

describe('studyTraits (educational morphology filters)', () => {
  it('maps classic families to study traits', () => {
    expect(studyTraitForSpecies({ taxon: 'Amanita phalloides', family: 'Amanitaceae' })).toBe(
      'gills',
    )
    expect(studyTraitForSpecies({ taxon: 'Boletus edulis', family: 'Boletaceae' })).toBe('pores')
    expect(
      studyTraitForSpecies({ taxon: 'Cantharellus cibarius', family: 'Cantharellaceae' }),
    ).toBe('folds')
    expect(studyTraitForSpecies({ taxon: 'Hydnum repandum', family: 'Hydnaceae' })).toBe('teeth')
    expect(studyTraitForSpecies({ taxon: 'Morchella esculenta', family: 'Morchellaceae' })).toBe(
      'ascomycete',
    )
    expect(studyTraitForSpecies({ taxon: 'Phallus impudicus', family: 'Phallaceae' })).toBe(
      'other',
    )
  })

  it('falls back via genus map when family missing', () => {
    expect(studyTraitForSpecies({ taxon: 'Amanita muscaria', family: null })).toBe('gills')
    expect(studyTraitForSpecies({ taxon: 'Suillus luteus', family: undefined })).toBe('pores')
    expect(studyTraitForSpecies({ taxon: 'Gyromitra esculenta', family: null })).toBe(
      'ascomycete',
    )
  })

  it('filter + match helpers are pure study aids', () => {
    const rows = [
      { taxon: 'Amanita phalloides', family: 'Amanitaceae' },
      { taxon: 'Boletus edulis', family: 'Boletaceae' },
      { taxon: 'Cantharellus cibarius', family: 'Cantharellaceae' },
    ]
    expect(filterByStudyTrait(rows, 'all')).toHaveLength(3)
    expect(filterByStudyTrait(rows, 'gills').map((r) => r.taxon)).toEqual([
      'Amanita phalloides',
    ])
    expect(matchesStudyTrait(rows[1], 'pores')).toBe(true)
    expect(matchesStudyTrait(rows[1], 'gills')).toBe(false)
  })

  it('counts cover all options and total', () => {
    const rows = [
      { taxon: 'Amanita phalloides', family: 'Amanitaceae' },
      { taxon: 'Boletus edulis', family: 'Boletaceae' },
      { taxon: 'Hydnum repandum', family: 'Hydnaceae' },
    ]
    const c = countByStudyTrait(rows)
    expect(c.all).toBe(3)
    expect(c.gills).toBe(1)
    expect(c.pores).toBe(1)
    expect(c.teeth).toBe(1)
    expect(STUDY_TRAIT_OPTIONS.length).toBeGreaterThanOrEqual(5)
  })

  it('policy never implies consumption permission', () => {
    expect(STUDY_TRAIT_POLICY_ES.toLowerCase()).toMatch(/nunca|orientaci/)
    expect(STUDY_TRAIT_POLICY_ES.toLowerCase()).not.toMatch(/comestible seguro|safe to eat/)
  })
})
