/**
 * Expanded species catalog — risk-first, Spanish names, photo tiers.
 * Heavy JSON is loaded via dynamic import (code-split) so home/entry
 * does not force the full payload into the main chunk.
 */
import { enrichCommonNames } from './commonNamesEs'
import { familyForTaxon } from './genusFamilyMap'
import { familyNameEs } from './familyNamesEs'
import { getPhotoTier, type PhotoTier } from './photoTiers'

export type CatalogSpecies = {
  taxon: string
  slug: string
  rank: string
  common_names: string[]
  risk_label: string
  family?: string | null
  family_es?: string | null
  description?: string
  source?: string
  display_name?: string
  photo_hint?: string
  photo_tier: PhotoTier
  /** Documented food class when synced (optional; never invented). */
  food_class?: string | null
  food_label?: string | null
  food_sources?: string[] | null
}

export type SpeciesCatalogFile = {
  version: string
  generated: string
  policy: string
  count: number
  sources: string[]
  species: CatalogSpecies[]
}

export type SpeciesCatalogMeta = {
  version: string
  count: number
  policy: string
  sources: string[]
  with_family: number
  with_family_es: number
  photo_t0: number
  photo_t1: number
  photo_t2: number
  loaded: boolean
}

function polishTaxon(taxon: string): string {
  const parts = taxon.trim().split(/\s+/)
  if (parts.length < 2) return taxon.trim()
  const genus = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  const rest = parts.slice(1).map((p) => p.toLowerCase()).join(' ')
  return `${genus} ${rest}`
}

function hydrateSpecies(data: SpeciesCatalogFile): CatalogSpecies[] {
  return data.species.map((s) => {
    const taxon = polishTaxon(s.taxon)
    const common_names = enrichCommonNames(taxon, s.common_names || [])
    const family = familyForTaxon(taxon, s.family)
    const family_es = family ? familyNameEs(family) : familyNameEs(null)
    const slug =
      s.slug ||
      taxon
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    const photo_tier = getPhotoTier(taxon, s.risk_label)
    return {
      ...s,
      taxon,
      slug,
      family,
      family_es,
      common_names,
      display_name: common_names[0] || taxon,
      photo_tier,
    }
  })
}

function buildMeta(data: SpeciesCatalogFile, list: CatalogSpecies[]): SpeciesCatalogMeta {
  return {
    version: data.version,
    count: list.length,
    policy: data.policy,
    sources: data.sources,
    with_family: list.filter((s) => Boolean(s.family)).length,
    with_family_es: list.filter((s) => Boolean(s.family_es && s.family_es !== 'Sin familia'))
      .length,
    photo_t0: list.filter((s) => s.photo_tier === 'T0').length,
    photo_t1: list.filter((s) => s.photo_tier === 'T1').length,
    photo_t2: list.filter((s) => s.photo_tier === 'T2').length,
    loaded: true,
  }
}

/** Live binding — empty until loadSpeciesCatalog() resolves (ESM live export). */
export let speciesCatalog: CatalogSpecies[] = []

export let speciesCatalogMeta: SpeciesCatalogMeta = {
  version: 'unloaded',
  count: 0,
  policy: 'orientation_only; unsafe_to_consume',
  sources: [],
  with_family: 0,
  with_family_es: 0,
  photo_t0: 0,
  photo_t1: 0,
  photo_t2: 0,
  loaded: false,
}

let loadPromise: Promise<CatalogSpecies[]> | null = null

/** Map local v2 SSOT → atelier CatalogSpecies shape (unification Phase A). */
function riskFromV2(risk: string, edib: string): string {
  const r = (risk || '').toLowerCase()
  const e = (edib || '').toLowerCase()
  if (r === 'deadly' || e === 'mortifero') return 'deadly'
  if (r === 'high' || e === 'toxico') return 'toxic'
  if (r === 'risky_lookalikes' || e === 'comestible_con_cautela') return 'risky_lookalikes'
  if (r === 'medium' || e === 'no_recomendado') return 'caution'
  if (r === 'low' || e === 'excelente' || e === 'buen_comestible') return 'low'
  return 'unknown'
}

function fromV2Record(rec: Record<string, unknown>): CatalogSpecies {
  const taxon = String(rec.scientific_name || rec.taxon || '').trim()
  const slug =
    String(rec.slug || '') ||
    taxon
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  const vern = (rec.vernacular_names || {}) as Record<string, string[]>
  const fromVern = [
    ...(vern.es || []),
    ...(vern.en || []),
    ...(vern.ca || []),
    ...(vern.eu || []),
  ].filter(Boolean)
  const unique = Array.from(new Set(fromVern))
  const risk_level = String(rec.risk_level || 'unknown')
  const edibility_code = String(rec.edibility_code || 'desconocido')
  const risk_label = riskFromV2(risk_level, edibility_code)
  // Enrich missing family + Spanish commons (parity with hydrateSpecies / tests)
  const family = familyForTaxon(taxon, rec.family ? String(rec.family) : null)
  const common_names = enrichCommonNames(taxon, unique.length ? unique : [taxon])
  const descMap = (rec.description || {}) as Record<string, string>
  const description = descMap.es || descMap.en || ''
  const photo_tier = getPhotoTier(taxon, risk_label)
  return {
    taxon,
    slug,
    rank: 'species',
    common_names,
    risk_label,
    family,
    family_es: family ? familyNameEs(family) : familyNameEs(null),
    description,
    source: String(rec.source || 'species_catalog_v2'),
    display_name: common_names[0] || taxon,
    photo_hint: undefined,
    photo_tier,
    food_class: edibility_code,
    food_label: edibility_code,
    food_sources: null,
  }
}

/**
 * Dynamically import heavy catalog JSON (separate Vite chunk) and hydrate once.
 * Prefer SSOT v2 snapshot (520+) when present; fall back to colleague expanded JSON.
 */
export async function loadSpeciesCatalog(): Promise<CatalogSpecies[]> {
  if (speciesCatalog.length > 0) return speciesCatalog
  if (!loadPromise) {
    loadPromise = (async () => {
      // 1) Local SSOT v2 (unified catalog)
      try {
        const v2mod = await import('./generated/species_catalog_snapshot.json')
        const v2 = v2mod.default as {
          catalog_version?: string
          count?: number
          species?: Record<string, unknown>[]
        }
        if (v2.species?.length) {
          // E-10: SSOT v2 only — skip dual merge of legacy speciesCatalog.json
          // (saves parse/hydrate of ~347 extra taxa on every first open).
          const list = v2.species.map(fromV2Record)
          speciesCatalog = list
          speciesCatalogMeta = {
            version: v2.catalog_version || 'v2',
            count: list.length,
            policy: 'orientation_only; unsafe_to_consume; ssot_v2',
            sources: ['species_catalog_v2'],
            with_family: list.filter((s) => Boolean(s.family)).length,
            with_family_es: list.filter(
              (s) => Boolean(s.family_es && s.family_es !== 'Sin familia'),
            ).length,
            photo_t0: list.filter((s) => s.photo_tier === 'T0').length,
            photo_t1: list.filter((s) => s.photo_tier === 'T1').length,
            photo_t2: list.filter((s) => s.photo_tier === 'T2').length,
            loaded: true,
          }
          return speciesCatalog
        }
      } catch {
        /* fall through */
      }

      // 2) Colleague expanded catalog only
      const mod = await import('./speciesCatalog.json')
      const data = mod.default as SpeciesCatalogFile
      speciesCatalog = hydrateSpecies(data)
      speciesCatalogMeta = buildMeta(data, speciesCatalog)
      return speciesCatalog
    })()
  }
  return loadPromise
}

/** True after first successful load. */
export function isCatalogLoaded(): boolean {
  return speciesCatalogMeta.loaded && speciesCatalog.length > 0
}

export function familyCoverageStats(): {
  total: number
  with_family: number
  without_family: number
  unique_families: number
  with_family_es: number
} {
  const fams = new Set<string>()
  let with_family = 0
  let with_family_es = 0
  for (const s of speciesCatalog) {
    if (s.family) {
      with_family += 1
      fams.add(s.family)
      if (s.family_es && s.family_es !== 'Sin familia') with_family_es += 1
    }
  }
  return {
    total: speciesCatalog.length,
    with_family,
    without_family: speciesCatalog.length - with_family,
    unique_families: fams.size,
    with_family_es,
  }
}

export function getSpeciesBySlug(slug: string): CatalogSpecies | undefined {
  const key = slug.toLowerCase().trim()
  return (
    speciesCatalog.find((s) => s.slug === key) ||
    speciesCatalog.find((s) => s.taxon.toLowerCase().replace(/\s+/g, '-') === key)
  )
}

export function getSpeciesByTaxon(taxon: string): CatalogSpecies | undefined {
  const key = taxon.trim().toLowerCase()
  return speciesCatalog.find((s) => s.taxon.toLowerCase() === key)
}

export function searchSpecies(query: string, limit = 40): CatalogSpecies[] {
  const q = query.trim().toLowerCase()
  if (!q) return speciesCatalog.slice(0, limit)
  return speciesCatalog
    .filter(
      (s) =>
        s.taxon.toLowerCase().includes(q) ||
        s.common_names.some((c) => c.toLowerCase().includes(q)) ||
        (s.family && s.family.toLowerCase().includes(q)),
    )
    .slice(0, limit)
}

export function countByRisk(): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const s of speciesCatalog) {
    acc[s.risk_label] = (acc[s.risk_label] || 0) + 1
  }
  return acc
}
