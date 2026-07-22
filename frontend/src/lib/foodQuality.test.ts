import { describe, expect, it } from 'vitest'
import {
  buildFoodQualityRegistry,
  edibilityToFoodClass,
  foodQualityStats,
  getFoodQuality,
  listDocumentedFoodQuality,
} from './foodQuality'
import { mushroomDatabase } from '../data/mushroomDatabase'
import poisonous from '../data/poisonousSpecies.json'

describe('foodQuality — real sources only', () => {
  it('maps edibility without inventing comestible for desconocido', () => {
    expect(edibilityToFoodClass('excelente')).toBe('comestible')
    expect(edibilityToFoodClass('buen_comestible')).toBe('comestible')
    expect(edibilityToFoodClass('comestible_con_cautela')).toBe('no_comestible')
    expect(edibilityToFoodClass('no_recomendado')).toBe('no_comestible')
    expect(edibilityToFoodClass('toxico')).toBe('toxica')
    expect(edibilityToFoodClass('mortifero')).toBe('mortal')
    expect(edibilityToFoodClass('desconocido')).toBeNull()
  })

  it('documents Boletus edulis as comestible from DB', () => {
    const q = getFoodQuality('Boletus edulis')
    expect(q).not.toBeNull()
    expect(q!.food_class).toBe('comestible')
    expect(q!.sources.some((s) => s.includes('mushroomDatabase'))).toBe(true)
  })

  it('documents Amanita phalloides as mortal', () => {
    const q = getFoodQuality('Amanita phalloides')
    expect(q).not.toBeNull()
    expect(q!.food_class).toBe('mortal')
  })

  it('never invents quality for random unknown taxon', () => {
    expect(getFoodQuality('Fakeus inventus xyz')).toBeNull()
  })

  it('registry size matches real curated data (not inflated)', () => {
    const reg = buildFoodQualityRegistry(mushroomDatabase, poisonous as never)
    const stats = foodQualityStats(reg)
    // ~197 DB with edibility + poison-only extras, but desconocido excluded
    expect(stats.total_documented).toBeGreaterThan(100)
    expect(stats.total_documented).toBeLessThanOrEqual(mushroomDatabase.length + poisonous.length)
    expect(stats.by_class.comestible).toBeGreaterThan(50)
    expect(stats.by_class.mortal).toBeGreaterThan(5)
    // every record has a source
    for (const r of listDocumentedFoodQuality()) {
      expect(r.sources.length).toBeGreaterThan(0)
      expect(r.food_class).not.toBeFalsy()
    }
  })

  it('poison list can only raise severity, never invent edible', () => {
    const reg = buildFoodQualityRegistry(
      [
        {
          scientificName: 'Test toxica',
          commonNames: ['T'],
          tagline: '',
          description: '',
          family: 'X',
          habitat: '',
          season: '',
          cap: '',
          stem: '',
          hymenium: '',
          edibility: 'buen_comestible',
          keyFeatures: [],
          categories: [],
          icon: '',
        },
      ],
      [{ latin_name: 'Test toxica', risk_level: 'critical', notes: 'override' }],
    )
    expect(reg.get('test toxica')!.food_class).toBe('mortal')
  })
})
