/**
 * Lookalike Studio — pure selection/compare logic for 2–3 taxa (S6).
 * Risk-ranked educational comparison; never consumption guidance.
 */
import { loadSpeciesCatalog, speciesCatalog, type CatalogSpecies } from '../data/speciesCatalog'

/** Ensure catalog is available for studio helpers (code-split). */
export async function ensureLookalikeCatalog(): Promise<CatalogSpecies[]> {
  return loadSpeciesCatalog()
}
import { getPhotoTier, type PhotoTier } from '../data/photoTiers'
import { toRiskLabel, type RiskLabel } from './riskLabels'
import { searchCatalogRanked } from './catalogSearch'

export const LOOKALIKE_STUDIO_MIN = 2
export const LOOKALIKE_STUDIO_MAX = 3

export type StudioTaxonCard = {
  taxon: string
  slug: string
  common_names: string[]
  family: string | null
  family_es: string | null
  risk_label: RiskLabel
  photo_tier: PhotoTier
  in_catalog: boolean
}

export type StudioCompareRow = {
  field: string
  values: string[]
}

/** Normalize and resolve a taxon string to a studio card. */
export function resolveStudioTaxon(query: string): StudioTaxonCard | null {
  const q = query.trim()
  if (!q) return null
  const ranked = searchCatalogRanked(speciesCatalog, { query: q, limit: 5, boostHighRisk: true })
  const hit =
    ranked.find((s) => s.taxon.toLowerCase() === q.toLowerCase()) ||
    ranked.find((s) => s.matchScore >= 40) ||
    ranked[0]
  if (!hit) {
    // free text not in catalog
    return {
      taxon: q,
      slug: q.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      common_names: [],
      family: null,
      family_es: null,
      risk_label: 'dangerous_or_unknown',
      photo_tier: getPhotoTier(q, 'dangerous_or_unknown'),
      in_catalog: false,
    }
  }
  return catalogToCard(hit)
}

function catalogToCard(s: CatalogSpecies): StudioTaxonCard {
  return {
    taxon: s.taxon,
    slug: s.slug,
    common_names: s.common_names,
    family: s.family ?? null,
    family_es: s.family_es ?? null,
    risk_label: toRiskLabel(s.risk_label),
    photo_tier: s.photo_tier,
    in_catalog: true,
  }
}

/**
 * Add a taxon to the selection (max 3, no duplicates).
 * Returns next selection or previous if invalid.
 */
export function addToStudioSelection(
  current: StudioTaxonCard[],
  query: string,
): { selection: StudioTaxonCard[]; error: string | null } {
  if (current.length >= LOOKALIKE_STUDIO_MAX) {
    return { selection: current, error: `Máximo ${LOOKALIKE_STUDIO_MAX} taxones` }
  }
  const card = resolveStudioTaxon(query)
  if (!card) return { selection: current, error: 'Taxón no encontrado' }
  if (current.some((c) => c.taxon.toLowerCase() === card.taxon.toLowerCase())) {
    return { selection: current, error: 'Ya está en la comparación' }
  }
  return { selection: [...current, card], error: null }
}

export function removeFromStudioSelection(
  current: StudioTaxonCard[],
  taxon: string,
): StudioTaxonCard[] {
  return current.filter((c) => c.taxon.toLowerCase() !== taxon.toLowerCase())
}

export function canCompare(selection: StudioTaxonCard[]): boolean {
  return selection.length >= LOOKALIKE_STUDIO_MIN && selection.length <= LOOKALIKE_STUDIO_MAX
}

/** Build side-by-side comparison rows for the studio UI. */
export function buildCompareRows(selection: StudioTaxonCard[]): StudioCompareRow[] {
  if (selection.length < LOOKALIKE_STUDIO_MIN) return []
  return [
    {
      field: 'Nombre común',
      values: selection.map((s) => s.common_names[0] || 'Sin nombre común local'),
    },
    {
      field: 'Nombre científico',
      values: selection.map((s) => s.taxon),
    },
    {
      field: 'Familia',
      values: selection.map((s) =>
        s.family_es && s.family && s.family_es !== s.family
          ? `${s.family_es} · ${s.family}`
          : s.family_es || s.family || '—',
      ),
    },
    {
      field: 'Riesgo (orientación)',
      values: selection.map((s) => s.risk_label),
    },
    {
      field: 'En catálogo',
      values: selection.map((s) => (s.in_catalog ? 'Sí' : 'No')),
    },
  ]
}

/** Suggest deadly/high-risk lookalikes for a seed taxon from catalog family + risk. */
export function suggestStudioPeers(seedTaxon: string, limit = 6): StudioTaxonCard[] {
  const seed = resolveStudioTaxon(seedTaxon)
  if (!seed) return []
  const family = seed.family
  const peers = speciesCatalog
    .filter((s) => {
      if (s.taxon === seed.taxon) return false
      const risk = toRiskLabel(s.risk_label)
      const high = risk === 'deadly' || risk === 'poisonous' || risk === 'toxic'
      const sameFamily = family && s.family === family
      return high || sameFamily
    })
    .sort((a, b) => {
      const ra = toRiskLabel(a.risk_label)
      const rb = toRiskLabel(b.risk_label)
      const score = (r: RiskLabel) =>
        r === 'deadly' ? 3 : r === 'poisonous' ? 2 : r === 'toxic' ? 1 : 0
      return score(rb) - score(ra)
    })
    .slice(0, limit)
  return peers.map(catalogToCard)
}
