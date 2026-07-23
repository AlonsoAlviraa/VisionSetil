/**
 * Lookalike Studio — selection/compare + classic confusion pairs.
 * Risk-ranked educational comparison; never consumption guidance.
 */
import { loadSpeciesCatalog, speciesCatalog, type CatalogSpecies } from '../data/speciesCatalog'
import { getPhotoTier, type PhotoTier } from '../data/photoTiers'
import { toRiskLabel, type RiskLabel } from './riskLabels'
import { searchCatalogRanked } from './catalogSearch'

/** Ensure catalog is available for studio helpers (code-split). */
export async function ensureLookalikeCatalog(): Promise<CatalogSpecies[]> {
  return loadSpeciesCatalog()
}

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
  /** Highlight row when values differ (interactive teaching). */
  highlight?: boolean
}

/** Famous field confusions (educational). Order: edible-looking first often, deadly second. */
export type ClassicLookalikePair = {
  id: string
  label: string
  /** Short Spanish reason for the confusion */
  why: string
  taxa: [string, string] | [string, string, string]
}

export const CLASSIC_LOOKALIKE_PAIRS: ClassicLookalikePair[] = [
  {
    id: 'caesarea-phalloides',
    label: 'Oronja vs oronja verde',
    why: 'Sombrero similar; láminas y volva deciden',
    taxa: ['Amanita caesarea', 'Amanita phalloides'],
  },
  {
    id: 'edulis-rubellus',
    label: 'Boleto vs cortinario mortal',
    why: 'Pie y cortina: no confiar en el “hongo”',
    taxa: ['Boletus edulis', 'Cortinarius rubellus'],
  },
  {
    id: 'muscaria-pantherina',
    label: 'Matamoscas vs pantera',
    why: 'Anillo, volva y base del pie',
    taxa: ['Amanita muscaria', 'Amanita pantherina'],
  },
  {
    id: 'deliciosus-torminosus',
    label: 'Níscalo vs rúsula/lactario riesgoso',
    why: 'Látex y hábitat de pinar',
    taxa: ['Lactarius deliciosus', 'Lactarius torminosus'],
  },
  {
    id: 'procera-lepiota',
    label: 'Apagador vs lepiota mortal',
    why: 'Tamaño y anillo móvil; lepiotas pequeñas = peligro',
    taxa: ['Macrolepiota procera', 'Lepiota brunneoincarnata'],
  },
  {
    id: 'galerina-honey',
    label: 'Armillaria vs galerina mortal',
    why: 'Sobre madera: galerina es mortal',
    taxa: ['Armillaria mellea', 'Galerina marginata'],
  },
  {
    id: 'cibarius-omphalotus',
    label: 'Rebozuelo vs falso rebozuelo tóxico',
    why: 'Láminas verdaderas vs pliegues',
    taxa: ['Cantharellus cibarius', 'Omphalotus olearius'],
  },
  {
    id: 'comatus-atramentaria',
    label: 'Matacandil vs coprino de tinta',
    why: 'Alcohol + coprino = reacción peligrosa',
    taxa: ['Coprinus comatus', 'Coprinopsis atramentaria'],
  },
]

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
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

function freeTextCard(q: string): StudioTaxonCard {
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

/** Normalize and resolve a taxon string to a studio card (prefer exact matches). */
export function resolveStudioTaxon(query: string): StudioTaxonCard | null {
  const q = query.trim()
  if (!q) return null
  const qf = fold(q)

  // 1) Exact scientific name
  const exactSci = speciesCatalog.find((s) => fold(s.taxon) === qf)
  if (exactSci) return catalogToCard(exactSci)

  // 2) Exact common name (any vernacular)
  const exactCommon = speciesCatalog.find((s) =>
    (s.common_names || []).some((c) => fold(c) === qf),
  )
  if (exactCommon) return catalogToCard(exactCommon)

  // 3) Common name starts-with / includes (prefer shorter names = more specific)
  const commonHits = speciesCatalog
    .filter((s) =>
      (s.common_names || []).some((c) => {
        const cf = fold(c)
        return cf.startsWith(qf) || cf.includes(qf)
      }),
    )
    .sort((a, b) => {
      const ac = (a.common_names[0] || a.taxon).length
      const bc = (b.common_names[0] || b.taxon).length
      return ac - bc
    })
  if (commonHits[0] && qf.length >= 3) return catalogToCard(commonHits[0])

  // 4) Ranked search (scientific-ish)
  const ranked = searchCatalogRanked(speciesCatalog, {
    query: q,
    limit: 8,
    boostHighRisk: true,
  })
  const hit =
    ranked.find((s) => fold(s.taxon) === qf) ||
    ranked.find((s) => (s.matchScore ?? 0) >= 55) ||
    ranked.find((s) => fold(s.taxon).startsWith(qf.split(/\s+/)[0] || qf)) ||
    ranked[0]
  if (hit) return catalogToCard(hit)

  return freeTextCard(q)
}

/**
 * Add a taxon to the selection (max 3, no duplicates).
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

/** Load a classic pair/triple in one gesture (replaces selection). */
export function loadClassicPair(pair: ClassicLookalikePair): {
  selection: StudioTaxonCard[]
  missing: string[]
} {
  const selection: StudioTaxonCard[] = []
  const missing: string[] = []
  for (const t of pair.taxa) {
    const card = resolveStudioTaxon(t)
    if (!card || !card.in_catalog) {
      missing.push(t)
      if (card) selection.push(card)
      continue
    }
    if (!selection.some((s) => s.taxon === card.taxon)) selection.push(card)
  }
  return { selection: selection.slice(0, LOOKALIKE_STUDIO_MAX), missing }
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
  const rows: StudioCompareRow[] = [
    {
      field: 'Nombre común',
      values: selection.map((s) => s.common_names[0] || '—'),
    },
    {
      field: 'Científico',
      values: selection.map((s) => s.taxon),
    },
    {
      field: 'Familia',
      values: selection.map((s) => s.family_es || s.family || '—'),
    },
    {
      field: 'Riesgo',
      values: selection.map((s) => s.risk_label),
      highlight: new Set(selection.map((s) => s.risk_label)).size > 1,
    },
    {
      field: 'Catálogo',
      values: selection.map((s) => (s.in_catalog ? 'Sí' : 'No')),
    },
  ]
  // Highlight family row if mixed families (teaching signal)
  if (new Set(selection.map((s) => s.family || '—')).size > 1) {
    const fam = rows.find((r) => r.field === 'Familia')
    if (fam) fam.highlight = true
  }
  return rows
}

function classicPeersFor(seedTaxon: string): string[] {
  const f = fold(seedTaxon)
  const out: string[] = []
  for (const pair of CLASSIC_LOOKALIKE_PAIRS) {
    const list = pair.taxa.map((t) => fold(t))
    if (!list.includes(f)) continue
    for (const t of pair.taxa) {
      if (fold(t) !== f) out.push(t)
    }
  }
  return out
}

/** Suggest lookalikes: classic pairs first, then same family / high risk. */
export function suggestStudioPeers(seedTaxon: string, limit = 8): StudioTaxonCard[] {
  const seed = resolveStudioTaxon(seedTaxon)
  if (!seed) return []
  const seen = new Set<string>([fold(seed.taxon)])
  const out: StudioTaxonCard[] = []

  for (const t of classicPeersFor(seed.taxon)) {
    const c = resolveStudioTaxon(t)
    if (!c || seen.has(fold(c.taxon))) continue
    seen.add(fold(c.taxon))
    out.push(c)
    if (out.length >= limit) return out
  }

  const family = seed.family
  const peers = speciesCatalog
    .filter((s) => {
      if (seen.has(fold(s.taxon))) return false
      const risk = toRiskLabel(s.risk_label)
      const high = risk === 'deadly' || risk === 'poisonous' || risk === 'toxic'
      const sameFamily = Boolean(family && s.family === family)
      return high || sameFamily
    })
    .sort((a, b) => {
      const score = (r: RiskLabel) =>
        r === 'deadly' ? 3 : r === 'poisonous' ? 2 : r === 'toxic' ? 1 : 0
      const sa = score(toRiskLabel(a.risk_label)) + (family && a.family === family ? 2 : 0)
      const sb = score(toRiskLabel(b.risk_label)) + (family && b.family === family ? 2 : 0)
      return sb - sa
    })

  for (const s of peers) {
    if (out.length >= limit) break
    out.push(catalogToCard(s))
    seen.add(fold(s.taxon))
  }
  return out
}

/** Classic pairs that have ≥2 taxa resolvable in catalog. */
export function availableClassicPairs(): ClassicLookalikePair[] {
  return CLASSIC_LOOKALIKE_PAIRS.filter((p) => {
    const resolved = p.taxa.map((t) => resolveStudioTaxon(t)).filter((c) => c?.in_catalog)
    return resolved.length >= 2
  })
}
