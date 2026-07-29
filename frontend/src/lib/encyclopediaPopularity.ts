/**
 * Encyclopedia empty-query ranking — most-searched / popular taxa first.
 * Pure helpers (no React). Orientation only — never consumption permission.
 */
import type { CatalogSpecies } from '../data/speciesCatalog'
import { searchCatalogRanked } from './catalogSearch'
import { getCatalogPhotoUrl } from './speciesImageService'
import { getGalleryExtras } from './speciesGalleryExtras'
import { photoPriorityScore } from './speciesMediaStack'
import { scientificNameToSlug } from './slug'
import type { RiskLabel } from './riskLabels'

/**
 * Curated high-search / high-demand taxa (Iberia + global Google-style interest).
 * Order = popularity for empty encyclopedia browse (index 0 = strongest).
 * Includes culinary icons and classic education searches (death cap, fly agaric).
 */
export const HIGH_SEARCH_TAXA: readonly string[] = [
  'Boletus edulis',
  'Cantharellus cibarius',
  'Lactarius deliciosus',
  'Amanita caesarea',
  'Macrolepiota procera',
  'Pleurotus ostreatus',
  'Agaricus campestris',
  'Morchella esculenta',
  'Amanita phalloides',
  'Amanita muscaria',
  'Boletus aereus',
  'Craterellus cornucopioides',
  'Hydnum repandum',
  'Imleria badia',
  'Leccinum scabrum',
  'Suillus luteus',
  'Coprinus comatus',
  'Lepista nuda',
  'Marasmius oreades',
  'Agaricus bisporus',
  'Galerina marginata',
  'Amanita pantherina',
  'Hypholoma fasciculare',
  'Armillaria mellea',
  'Russula cyanoxantha',
] as const

const HIGH_SEARCH_SLUGS: readonly string[] = HIGH_SEARCH_TAXA.map(
  (t) => scientificNameToSlug(t) || t.toLowerCase().replace(/\s+/g, '-'),
)

/** Base score from high-search list (higher = more popular). 0 if not listed. */
export function encyclopediaPopularityScore(slugOrTaxon: string): number {
  const slug = scientificNameToSlug(slugOrTaxon) || String(slugOrTaxon).toLowerCase()
  const i = HIGH_SEARCH_SLUGS.indexOf(slug)
  if (i < 0) return 0
  // Leave headroom above photoPriorityScore (max ~1000)
  return 50_000 - i * 100
}

/**
 * Composite empty-browse score: popularity ≫ photo pack quality ≫ catalog presence.
 * Search mode must NOT use this alone (callers only sort when query is empty).
 */
export function encyclopediaBrowseScore(slugOrTaxon: string): number {
  const slug = scientificNameToSlug(slugOrTaxon) || String(slugOrTaxon).toLowerCase()
  const taxonHint = String(slugOrTaxon).includes(' ')
    ? String(slugOrTaxon)
    : slug.replace(/-/g, ' ')
  let score = encyclopediaPopularityScore(slug)
  score += photoPriorityScore(slug)
  const extras = getGalleryExtras(slug)
  if (extras.length > 0) score += 80 + Math.min(extras.length, 8) * 5
  if (extras.some((p) => p.role === 'hero' || p.role === 'front')) score += 40
  if (getCatalogPhotoUrl(taxonHint) || getCatalogPhotoUrl(slug.replace(/-/g, ' '))) {
    score += 25
  }
  return score
}

/**
 * Sort encyclopedia browse list for empty query.
 * Stable secondary key: scientific name A–Z.
 */
export function sortEncyclopediaBrowseList<
  T extends { taxon: string; slug?: string | null },
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const sa = encyclopediaBrowseScore(a.slug || a.taxon)
    const sb = encyclopediaBrowseScore(b.slug || b.taxon)
    if (sb !== sa) return sb - sa
    return (a.taxon || '').localeCompare(b.taxon || '', 'en')
  })
}

export function isHighSearchTaxon(slugOrTaxon: string): boolean {
  return encyclopediaPopularityScore(slugOrTaxon) > 0
}

export type EmptyBrowseFilters = {
  risk?: RiskLabel | 'all'
  family?: string | 'all'
  /**
   * Optional food filter applied after catalog search (same as EncyclopediaPage).
   * Receives taxon scientific name; return true to keep.
   */
  foodKeep?: (taxon: string) => boolean
}

/**
 * **Shipped empty-query pipeline** (must stay in lockstep with EncyclopediaPage):
 * 1) Filter full catalog by risk/family with **no** high-risk pre-boost and **no** 200-cap
 * 2) Optional food filter
 * 3) sortEncyclopediaBrowseList (popularity ≫ photos)
 *
 * Never call searchCatalogRanked(limit:200, boostHighRisk:true) then popularity-sort —
 * that drops popular culinary taxa (e.g. níscalo) off page one.
 */
export function buildEmptyEncyclopediaBrowseList(
  species: CatalogSpecies[],
  filters: EmptyBrowseFilters = {},
): CatalogSpecies[] {
  const n = Math.max(species.length, 1)
  let list: CatalogSpecies[] = searchCatalogRanked(species, {
    query: '',
    risk: filters.risk ?? 'all',
    family: filters.family ?? 'all',
    limit: n,
    boostHighRisk: false,
  })
  if (filters.foodKeep) {
    list = list.filter((s) => filters.foodKeep!(s.taxon))
  }
  return sortEncyclopediaBrowseList(list)
}
