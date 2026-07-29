/**
 * Expanded species catalog — risk-first, Spanish names, photo tiers.
 * Heavy JSON is loaded via dynamic import (code-split) so home/entry
 * does not force the full payload into the main chunk.
 */
import { enrichCommonNames } from './commonNamesEs'
import { enrichCommonNamesEn } from './commonNamesEn'
import { familyForTaxon } from './genusFamilyMap'
import { familyNameEs } from './familyNamesEs'
import { getPhotoTier, type PhotoTier } from './photoTiers'
import { normalizeSlugParam, scientificNameToSlug } from '../lib/slug'
import { canonicalTaxonName } from '../lib/taxonSynonyms'

export type CatalogSpecies = {
  taxon: string
  slug: string
  rank: string
  /** Spanish-primary common names (local UI). */
  common_names: string[]
  /** English common names when available (EN locale). */
  common_names_en?: string[]
  /** Catalan vernaculars when available (CA locale). */
  common_names_ca?: string[]
  /** Basque vernaculars when available (EU locale). */
  common_names_eu?: string[]
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
  /** Fruiting season (Iberia educational). */
  season?: string | null
  /** Iberian presence bucket for Setadle / filters. */
  iberian_relevance?: string | null
  /** Legacy / SSOT edibility code when present. */
  documented_edibility?: string | null
  edibility_code?: string | null
  /**
   * Curated lookalike scientific names from SSOT (educational only).
   * Never invent pairs; empty means none curated — not "safe".
   */
  lookalikes?: string[]
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
  // Lazy import avoided — meta resolved at Setadle/detail time via resolveSpeciesMeta.
  // Here we only ensure family + family_es for browse/filter.
  return data.species.map((s) => {
    const taxon = polishTaxon(s.taxon)
    const common_names = enrichCommonNames(taxon, s.common_names || [])
    const common_names_en = enrichCommonNamesEn(taxon, s.common_names_en || [])
    const common_names_ca = (s.common_names_ca || [])
      .map((c) => String(c || '').trim())
      .filter(Boolean)
    const common_names_eu = (s.common_names_eu || [])
      .map((c) => String(c || '').trim())
      .filter(Boolean)
    const family = familyForTaxon(taxon, s.family)
    const family_es = family ? familyNameEs(family) : familyNameEs(null)
    const slug = scientificNameToSlug(s.slug || taxon) || scientificNameToSlug(taxon)
    const photo_tier = getPhotoTier(taxon, s.risk_label)
    return {
      ...s,
      taxon,
      slug,
      family,
      family_es,
      common_names,
      common_names_en,
      common_names_ca: common_names_ca.length ? common_names_ca : undefined,
      common_names_eu: common_names_eu.length ? common_names_eu : undefined,
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

/**
 * Canonical SSOT risk_label set (parity with scripts/sync_catalog_ssot.py
 * and backend/app/services/species_catalog.py `_risk_label_from_v2`).
 * Never maps to consumption permission language.
 */
export const CANONICAL_RISK_LABELS = [
  'deadly',
  'toxic',
  'unknown_or_risky',
  'dangerous_or_unknown',
] as const

export type CanonicalRiskLabel = (typeof CANONICAL_RISK_LABELS)[number]

/** Map v2 risk/edibility → expanded CatalogSpecies risk_label (D1 SSOT). */
export function riskFromV2(risk: string, edib: string): CanonicalRiskLabel {
  const r = (risk || '').toLowerCase().trim()
  const e = (edib || '').toLowerCase().trim()
  if (r === 'deadly' || r === 'critical' || e === 'mortifero') return 'deadly'
  if (r === 'high' || e === 'toxico') return 'toxic'
  if (r === 'risky_lookalikes' || e === 'comestible_con_cautela') return 'unknown_or_risky'
  if (r === 'medium' || e === 'no_recomendado' || e === 'inedible') return 'dangerous_or_unknown'
  // low / excelente / buen_comestible → never "edible"; educational low-risk bucket
  if (r === 'low' || e === 'excelente' || e === 'buen_comestible' || e === 'comestible') {
    return 'unknown_or_risky'
  }
  return 'dangerous_or_unknown'
}

/**
 * Map v2 edibility_code → FoodClass bucket (or null). Never store praise strings
 * like "excelente" on food_label (issue 7 / safety).
 */
function foodClassFromEdibility(edib: string): string | null {
  const e = (edib || '').toLowerCase().trim()
  if (e === 'excelente' || e === 'buen_comestible' || e === 'comestible') return 'comestible'
  if (e === 'comestible_con_cautela' || e === 'no_recomendado' || e === 'inedible') {
    return 'no_comestible'
  }
  if (e === 'toxico') return 'toxica'
  if (e === 'mortifero') return 'mortal'
  return null
}

/** Normalize SSOT lookalikes ({scientific_name, note_key} | string) → string[]. */
export function normalizeLookalikeNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const lk of raw) {
    let name = ''
    if (typeof lk === 'string') name = lk.trim()
    else if (lk && typeof lk === 'object') {
      const o = lk as Record<string, unknown>
      name = String(o.scientific_name || o.taxon || '').trim()
    }
    if (name.includes(' (')) name = name.split(' (', 1)[0].trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

function fromV2Record(rec: Record<string, unknown>): CatalogSpecies {
  const taxon = polishTaxon(String(rec.scientific_name || rec.taxon || '').trim())
  const slug =
    scientificNameToSlug(String(rec.slug || '') || taxon) || scientificNameToSlug(taxon)
  const vern = (rec.vernacular_names || {}) as Record<string, string[]>
  // Keep locales separate (Wordle + UI adapt per language — never mix CA/EU into ES bag)
  const fromEs = [...(vern.es || [])].filter(Boolean)
  const fromEn = [...(vern.en || [])].filter(Boolean)
  const fromCa = [...(vern.ca || [])].filter(Boolean)
  const fromEu = [...(vern.eu || [])].filter(Boolean)
  const risk_level = String(rec.risk_level || 'unknown')
  const edibility_code = String(rec.edibility_code || 'desconocido')
  const risk_label = riskFromV2(risk_level, edibility_code)
  // Enrich missing family + Spanish / English commons (parity with hydrateSpecies / tests)
  const family = familyForTaxon(taxon, rec.family ? String(rec.family) : null)
  const common_names = enrichCommonNames(taxon, fromEs)
  const common_names_en = enrichCommonNamesEn(taxon, fromEn)
  const common_names_ca = fromCa.map((c) => String(c).trim()).filter(Boolean)
  const common_names_eu = fromEu.map((c) => String(c).trim()).filter(Boolean)
  const descMap = (rec.description || {}) as Record<string, string>
  const description = descMap.es || descMap.en || ''
  const photo_tier = getPhotoTier(taxon, risk_label)
  const foodClass = foodClassFromEdibility(edibility_code)
  const lookalikes = normalizeLookalikeNames(rec.lookalikes)
  // Educational season (string or localized map { es, en, ... }) — never harvest guidance.
  const seasonRaw = rec.season
  let season: string | null = null
  if (typeof seasonRaw === 'string' && seasonRaw.trim()) {
    season = seasonRaw.trim()
  } else if (seasonRaw && typeof seasonRaw === 'object') {
    const sm = seasonRaw as Record<string, unknown>
    const pick = sm.es || sm.en || Object.values(sm).find((v) => typeof v === 'string')
    if (typeof pick === 'string' && pick.trim()) season = pick.trim()
  }
  return {
    taxon,
    slug,
    rank: 'species',
    common_names,
    common_names_en,
    common_names_ca: common_names_ca.length ? common_names_ca : undefined,
    common_names_eu: common_names_eu.length ? common_names_eu : undefined,
    risk_label,
    family,
    family_es: family ? familyNameEs(family) : familyNameEs(null),
    description,
    source: String(rec.source || 'species_catalog_v2'),
    display_name: common_names[0] || taxon,
    photo_hint: undefined,
    photo_tier,
    food_class: foodClass,
    food_label: foodClass,
    food_sources: null,
    season,
    lookalikes,
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

      // 2) Expanded CatalogSpecies JSON (SSOT-synced fallback; photo_tier hydrated below)
      const mod = await import('./speciesCatalog.json')
      const data = mod.default as unknown as SpeciesCatalogFile
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
  if (!slug) return undefined
  const key = normalizeSlugParam(slug)
  if (!key) return undefined
  // Synonym slug (e.g. coprinopsis-atramentaria) → SSOT slug
  const asName = key.replace(/-/g, ' ')
  const canonSlug = scientificNameToSlug(canonicalTaxonName(asName))
  return (
    speciesCatalog.find((s) => s.slug === key) ||
    speciesCatalog.find((s) => scientificNameToSlug(s.taxon) === key) ||
    (canonSlug && canonSlug !== key
      ? speciesCatalog.find((s) => s.slug === canonSlug)
      : undefined) ||
    // Fallback: direct case-insensitive slug match (pre-normalized catalogs)
    speciesCatalog.find((s) => s.slug.toLowerCase() === slug.toLowerCase().trim())
  )
}

export function getSpeciesByTaxon(taxon: string): CatalogSpecies | undefined {
  const raw = taxon.trim()
  const key = raw.toLowerCase()
  if (!key || key === 'undefined' || key === 'null') return undefined
  const canon = canonicalTaxonName(raw)
  const canonKey = canon.toLowerCase()
  return (
    speciesCatalog.find((s) => s.taxon.toLowerCase() === key) ||
    (canonKey !== key
      ? speciesCatalog.find((s) => s.taxon.toLowerCase() === canonKey)
      : undefined) ||
    speciesCatalog.find((s) => scientificNameToSlug(s.taxon) === scientificNameToSlug(raw)) ||
    speciesCatalog.find((s) => scientificNameToSlug(s.taxon) === scientificNameToSlug(canon))
  )
}

/** Locale-aware primary common name; never blank/undefined. Falls back to scientific. */
export function displayCommonName(
  s: Pick<CatalogSpecies, 'taxon' | 'common_names' | 'common_names_en' | 'display_name'>,
  locale?: string,
): string {
  const names = commonsForLocale(s, locale)
  return names[0] || s.taxon
}

/**
 * Common-name list for UI overrides (SpeciesNameBlock / detail).
 * EN: only English commons — never leak Spanish vernaculars.
 * Empty EN list → caller should pass [] so resolveSpeciesDisplay falls back to scientific.
 */
export function localeLang(locale?: string): 'es' | 'en' | 'ca' | 'eu' {
  const l = (locale || 'es').toLowerCase()
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('ca')) return 'ca'
  if (l.startsWith('eu')) return 'eu'
  return 'es'
}

function dedupeNames(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of list) {
    const t = (n == null ? '' : String(n).trim())
    if (!t || t === 'undefined' || t === 'null') continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

export function commonsForLocale(
  s: {
    taxon?: string
    common_names?: string[] | null
    common_names_en?: string[] | null
    common_names_ca?: string[] | null
    common_names_eu?: string[] | null
    display_name?: string | null
  },
  locale?: string,
  /** Optional rich-DB Spanish names — used only for non-EN locales. */
  richCommonNames?: string[] | null,
): string[] {
  const lang = localeLang(locale)
  if (lang === 'en') {
    const fromCat = dedupeNames(s.common_names_en || [])
    if (fromCat.length) return fromCat
    // Enrichment without Spanish catalog list
    return enrichCommonNamesEn(s.taxon || '', [])
  }
  if (lang === 'ca') {
    const ca = dedupeNames(s.common_names_ca || [])
    if (ca.length) return ca
    // Fallback chain: ES → EN enrichment (never invent Catalan)
    const es = dedupeNames([...(s.common_names || []), ...(richCommonNames || [])])
    if (es.length) return es
    if (s.display_name?.trim()) return [s.display_name.trim()]
    return enrichCommonNames(s.taxon || '', [])
  }
  if (lang === 'eu') {
    const eu = dedupeNames(s.common_names_eu || [])
    if (eu.length) return eu
    const es = dedupeNames([...(s.common_names || []), ...(richCommonNames || [])])
    if (es.length) return es
    if (s.display_name?.trim()) return [s.display_name.trim()]
    return enrichCommonNames(s.taxon || '', [])
  }
  // Spanish (default)
  const es = dedupeNames([...(s.common_names || []), ...(richCommonNames || [])])
  if (es.length) return es
  if (s.display_name?.trim()) return [s.display_name.trim()]
  return enrichCommonNames(s.taxon || '', [])
}

export function searchSpecies(query: string, limit = 40): CatalogSpecies[] {
  const q = query.trim().toLowerCase()
  if (!q) return speciesCatalog.slice(0, limit)
  return speciesCatalog
    .filter(
      (s) =>
        s.taxon.toLowerCase().includes(q) ||
        s.common_names.some((c) => c.toLowerCase().includes(q)) ||
        (s.common_names_en || []).some((c) => c.toLowerCase().includes(q)) ||
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
