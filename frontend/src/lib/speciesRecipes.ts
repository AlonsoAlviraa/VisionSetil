/**
 * Educational external recipe links for documented culinary taxa only.
 * Never recipes for deadly/toxic taxa. Encyclopedia surface only — never Identify.
 * Policy: orientation / cultural only; app does not authorize consumption.
 */
import recipesDb from '../data/speciesRecipes.json'
import { getFoodQuality } from './foodQuality'
import { scientificNameToSlug } from './slug'

export type RecipeLink = {
  title: string
  url: string
  lang: string
  disclaimer: string
}

export type SpeciesRecipeBundle = {
  taxon: string
  slug: string
  food_class: string
  disclaimer: string
  recipes: RecipeLink[]
}

type RecipesFile = {
  version?: string
  policy?: string
  default_disclaimer: string
  excluded_deadly: string[]
  species: Record<string, SpeciesRecipeBundle>
}

const db = recipesDb as RecipesFile

export const RECIPES_DEFAULT_DISCLAIMER = db.default_disclaimer

export const EXCLUDED_DEADLY_TAXA: readonly string[] = Object.freeze(
  (db.excluded_deadly || []).map((t) => t.trim()),
)

function normTaxon(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Slug or scientific name → recipe bundle (null if none). */
export function getSpeciesRecipes(
  slugOrTaxon: string | null | undefined,
): SpeciesRecipeBundle | null {
  if (!slugOrTaxon) return null
  const raw = slugOrTaxon.trim()
  if (!raw) return null

  const slug = raw.includes(' ') || /[A-Z]/.test(raw)
    ? scientificNameToSlug(raw)
    : raw.toLowerCase()

  const bySlug = db.species?.[slug]
  if (bySlug?.recipes?.length) return bySlug

  // Fallback: match taxon field
  const want = normTaxon(raw)
  for (const entry of Object.values(db.species || {})) {
    if (normTaxon(entry.taxon) === want && entry.recipes?.length) return entry
  }
  return null
}

/** True when encyclopedia may show recipe section (documented comestible only). */
export function hasEducationalRecipes(slugOrTaxon: string | null | undefined): boolean {
  const bundle = getSpeciesRecipes(slugOrTaxon)
  if (!bundle?.recipes?.length) return false
  // Hard ban: excluded deadly list
  if (isExcludedDeadlyTaxon(bundle.taxon)) return false
  // Prefer foodQuality SSOT when available
  const fq = getFoodQuality(bundle.taxon)
  if (fq && fq.food_class !== 'comestible') return false
  if (bundle.food_class !== 'comestible') return false
  return true
}

export function isExcludedDeadlyTaxon(taxon: string): boolean {
  const n = normTaxon(taxon)
  return EXCLUDED_DEADLY_TAXA.some((t) => normTaxon(t) === n)
}

export function listRecipeSlugs(): string[] {
  return Object.keys(db.species || {})
}

export function listAllRecipeBundles(): SpeciesRecipeBundle[] {
  return Object.values(db.species || {})
}

/** Parse/validate raw file shape (used by tests). */
export function parseRecipesFile(raw: unknown): {
  ok: boolean
  speciesCount: number
  recipeCount: number
  errors: string[]
} {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, speciesCount: 0, recipeCount: 0, errors: ['not an object'] }
  }
  const file = raw as RecipesFile
  if (!file.default_disclaimer || typeof file.default_disclaimer !== 'string') {
    errors.push('missing default_disclaimer')
  }
  if (!Array.isArray(file.excluded_deadly) || file.excluded_deadly.length < 1) {
    errors.push('missing excluded_deadly')
  }
  if (!file.species || typeof file.species !== 'object') {
    errors.push('missing species map')
    return { ok: false, speciesCount: 0, recipeCount: 0, errors }
  }
  let recipeCount = 0
  for (const [slug, entry] of Object.entries(file.species)) {
    if (!entry?.taxon) errors.push(`${slug}: missing taxon`)
    if (!entry?.disclaimer) errors.push(`${slug}: missing disclaimer`)
    if (entry?.food_class !== 'comestible') {
      errors.push(`${slug}: food_class must be comestible`)
    }
    if (!Array.isArray(entry?.recipes) || entry.recipes.length < 1) {
      errors.push(`${slug}: need at least one recipe`)
      continue
    }
    for (const r of entry.recipes) {
      if (!r.title || !r.url || !r.disclaimer) {
        errors.push(`${slug}: recipe missing title/url/disclaimer`)
      }
      if (r.url && !/^https:\/\//i.test(r.url)) {
        errors.push(`${slug}: recipe url must be https`)
      }
      recipeCount += 1
    }
    if (entry.taxon && isExcludedDeadlyTaxon(entry.taxon)) {
      errors.push(`${slug}: deadly taxon must never have recipes`)
    }
  }
  return {
    ok: errors.length === 0,
    speciesCount: Object.keys(file.species).length,
    recipeCount,
    errors,
  }
}
