import { describe, expect, it } from 'vitest'
import recipesDb from '../data/speciesRecipes.json'
import {
  EXCLUDED_DEADLY_TAXA,
  getSpeciesRecipes,
  hasEducationalRecipes,
  isExcludedDeadlyTaxon,
  listAllRecipeBundles,
  parseRecipesFile,
  RECIPES_DEFAULT_DISCLAIMER,
} from './speciesRecipes'
import { getFoodQuality } from './foodQuality'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEADLY = [
  'Amanita phalloides',
  'Amanita virosa',
  'Amanita verna',
  'Galerina marginata',
  'Cortinarius orellanus',
  'Cortinarius rubellus',
  'Lepiota brunneoincarnata',
  'Gyromitra esculenta',
]

describe('speciesRecipes — culinary only + permanent disclaimer', () => {
  it('parses recipes file with disclaimers and https links', () => {
    const parsed = parseRecipesFile(recipesDb)
    expect(parsed.errors, parsed.errors.join('; ')).toEqual([])
    expect(parsed.ok).toBe(true)
    expect(parsed.speciesCount).toBe(12)
    expect(parsed.recipeCount).toBeGreaterThanOrEqual(12 * 3)
    expect(RECIPES_DEFAULT_DISCLAIMER.toLowerCase()).toMatch(/app|autoriz|consum|expert/)
  })

  it('never links recipes for excluded deadly taxa', () => {
    for (const t of DEADLY) {
      expect(isExcludedDeadlyTaxon(t)).toBe(true)
      expect(getSpeciesRecipes(t)).toBeNull()
      expect(hasEducationalRecipes(t)).toBe(false)
    }
    for (const t of EXCLUDED_DEADLY_TAXA) {
      expect(getSpeciesRecipes(t)).toBeNull()
    }
    // Bundle taxa must not be in deadly list
    for (const b of listAllRecipeBundles()) {
      expect(DEADLY.map((x) => x.toLowerCase())).not.toContain(b.taxon.toLowerCase())
      expect(b.food_class).toBe('comestible')
      expect(b.disclaimer.length).toBeGreaterThan(20)
      for (const r of b.recipes) {
        expect(r.disclaimer.length).toBeGreaterThan(10)
      }
    }
  })

  it('only documents comestible taxa with foodQuality alignment when known', () => {
    const culinary = [
      'Boletus edulis',
      'Cantharellus cibarius',
      'Lactarius deliciosus',
      'Amanita caesarea',
      'Macrolepiota procera',
      'Pleurotus ostreatus',
      'Agaricus campestris',
      'Morchella esculenta',
      'Craterellus cornucopioides',
      'Hydnum repandum',
      'Coprinus comatus',
      'Boletus aereus',
    ]
    for (const t of culinary) {
      expect(hasEducationalRecipes(t)).toBe(true)
      const q = getFoodQuality(t)
      // When foodQuality knows the taxon, it must be comestible — never invent edible for toxics
      if (q) expect(q.food_class).toBe('comestible')
      const bundle = getSpeciesRecipes(t)
      expect(bundle?.recipes.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('resolves by slug and scientific name', () => {
    const a = getSpeciesRecipes('boletus-edulis')
    const b = getSpeciesRecipes('Boletus edulis')
    expect(a?.taxon).toBe('Boletus edulis')
    expect(b?.slug).toBe('boletus-edulis')
    expect(a?.recipes[0].url).toMatch(/^https:\/\//)
  })

  it('Identify surfaces have no recipe CTA / speciesRecipes import', () => {
    const identifySurfaces = [
      'components/ResultCard.tsx',
      'components/ResultModeBanner.tsx',
      'pages/IdentifyPage.tsx',
      'pages/HistoryPage.tsx',
    ]
    const RECIPE_IMPORT =
      /speciesRecipes|getSpeciesRecipes|hasEducationalRecipes|Recetas \(enlaces|detail\.recipes/
    for (const rel of identifySurfaces) {
      const path = join(srcRoot, rel)
      expect(existsSync(path), path).toBe(true)
      const text = readFileSync(path, 'utf8')
      expect(text, rel).not.toMatch(RECIPE_IMPORT)
    }
  })
})
