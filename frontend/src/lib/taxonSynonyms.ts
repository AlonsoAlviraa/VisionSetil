/**
 * Curated taxon synonym map for SSOT join (photos, lookalikes).
 * Source: data/species_catalog/taxon_synonyms.json → frontend/src/data/taxon_synonyms.json
 * Never invent taxa.
 */
import taxonSynonymsSsot from '../data/taxon_synonyms.json'

const TAXON_SYNONYMS: Record<string, string> = Object.fromEntries(
  Object.entries(
    (taxonSynonymsSsot as { synonyms?: Record<string, string> }).synonyms || {},
  ).map(([k, v]) => [k.toLowerCase(), String(v)]),
)

/** Reverse index: SSOT lowercase → curated alias keys (IF current forms, misspellings). */
const ALIASES_BY_CANONICAL: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>()
  for (const [alias, canon] of Object.entries(TAXON_SYNONYMS)) {
    const key = String(canon).toLowerCase()
    const list = m.get(key) || []
    list.push(alias)
    m.set(key, list)
  }
  return m
})()

/** Map known aliases to SSOT scientific name spelling. */
export function canonicalTaxonName(name: string): string {
  const raw = name.trim()
  if (!raw) return ''
  const stripped = raw.includes(' (') ? raw.split(' (')[0]!.trim() : raw
  return TAXON_SYNONYMS[stripped.toLowerCase()] ?? stripped
}

/**
 * Curated aliases that resolve to this SSOT taxon (lowercase keys).
 * Used for encyclopedia nomenclature search boost — never invents taxa.
 */
export function aliasesForTaxon(taxon: string): string[] {
  const key = taxon.trim().toLowerCase()
  if (!key) return []
  return ALIASES_BY_CANONICAL.get(key) || []
}

export function synonymMapSize(): number {
  return Object.keys(TAXON_SYNONYMS).length
}
