/**
 * Lookalike Studio — selection/compare + classic confusion pairs.
 * Risk-ranked educational comparison; never consumption guidance.
 *
 * Reverse-id educational duals (e.g. deliciosus-torminosus vs torminosus-deliciosus)
 * are intentional for bidirectional teaching surfaces — do not dedupe without product review.
 */
import {
  getSpeciesBySlug,
  getSpeciesByTaxon,
  loadSpeciesCatalog,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { getPhotoTier, type PhotoTier } from '../data/photoTiers'
import { toRiskLabel, type RiskLabel } from './riskLabels'
import { searchCatalogRanked } from './catalogSearch'
import { normalizeSlugParam, scientificNameToSlug } from './slug'
import { canonicalTaxonName } from './taxonSynonyms'

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
  /** English commons when available (EN UI). */
  common_names_en: string[]
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
    taxa: ['Coprinus comatus', 'Coprinus atramentarius'],
  },
  {
    id: 'phalloides-citrina',
    label: 'Oronja verde vs amanita citrina',
    why: 'Volva y láminas; no confiar en el color solo',
    taxa: ['Amanita phalloides', 'Amanita citrina'],
  },
  {
    id: 'pantherina-rubescens',
    label: 'Pantera vs rubescente',
    why: 'Enrojecimiento al corte y base del pie',
    taxa: ['Amanita pantherina', 'Amanita rubescens'],
  },
  {
    id: 'esculenta-gyromitra',
    label: 'Colmenilla vs gyromitra tóxica',
    why: 'Costillas vs cámaras; gyromitra es peligrosa',
    taxa: ['Morchella esculenta', 'Gyromitra esculenta'],
  },
  {
    id: 'gambosa-inocybe',
    label: 'San Jorge vs inocybe peligrosa',
    why: 'Prados de primavera; inocybe puede ser mortal',
    taxa: ['Calocybe gambosa', 'Inocybe erubescens'],
  },
  {
    id: 'mutabilis-hypholoma',
    label: 'Pholiota comestible vs hypholoma tóxico',
    why: 'Sobre madera: amargor y color de láminas',
    taxa: ['Kuehneromyces mutabilis', 'Hypholoma fasciculare'],
  },
  {
    id: 'prunulus-entoloma',
    label: 'Molinera vs entoloma tóxico',
    why: 'Láminas y olor; entoloma sinuatum es tóxico',
    taxa: ['Clitopilus prunulus', 'Entoloma sinuatum'],
  },
  // Expanded open-knowledge educational pairs (T7 / classic_lookalike_pairs.json)
  {
    id: 'edulis-satanas',
    label: 'Boleto vs satanás',
    why: 'Redes del pie y color del himenio; satanas enrojece y es tóxico',
    // SSOT canonical: Boletus satanas (Rubroboletus satanas is synonym)
    taxa: ['Boletus edulis', 'Boletus satanas'],
  },
  {
    // Stable pair id (historical spelling) — do NOT rename without migration.
    // SSOT taxon is Agaricus xanthoderma; xanthodermus remains synonym only.
    id: 'xanthodermus-campestris',
    label: 'Champiñón de prado vs xanthoderma',
    why: 'Base del pie amarilla al corte + olor a fenol = xanthoderma',
    taxa: ['Agaricus campestris', 'Agaricus xanthoderma'],
  },
  {
    id: 'olearius-cibarius',
    label: 'Falso rebozuelo vs rebozuelo',
    why: 'Láminas verdaderas vs pliegues; omphalotus es tóxico',
    taxa: ['Omphalotus olearius', 'Cantharellus cibarius'],
  },
  {
    id: 'phalloides-vaginata',
    label: 'Oronja verde vs amanita sin anillo',
    why: 'Anillo ausente en vaginata; volva y láminas siempre críticas',
    taxa: ['Amanita phalloides', 'Amanita vaginata'],
  },
  {
    id: 'torminosus-deliciosus',
    label: 'Lactario de abedul vs níscalo',
    why: 'Látex blanco vs naranja; borde del sombrero peludo en torminosus',
    taxa: ['Lactarius torminosus', 'Lactarius deliciosus'],
  },
  {
    id: 'involutus-edulis',
    label: 'Paxillus vs boleto',
    why: 'Paxillus tiene láminas/pliegues decurrentes; no es boleto de poros',
    taxa: ['Paxillus involutus', 'Boletus edulis'],
  },
  {
    id: 'galerina-mutabilis',
    label: 'Galerina mortal vs mutabilis',
    why: 'Sobre madera: esporada y anillo; galerina es mortal',
    taxa: ['Galerina marginata', 'Kuehneromyces mutabilis'],
  },
  {
    id: 'virosa-vaginata',
    label: 'Ángel destructor vs vaginata',
    why: 'Blancura engañosa; anillo y volva deciden',
    taxa: ['Amanita virosa', 'Amanita vaginata'],
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
    common_names_en: s.common_names_en || [],
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
    common_names_en: [],
    family: null,
    family_es: null,
    risk_label: 'dangerous_or_unknown',
    photo_tier: getPhotoTier(q, 'dangerous_or_unknown'),
    in_catalog: false,
  }
}

/**
 * Normalize and resolve a taxon string to a studio card.
 * Prefer SSOT via getSpeciesByTaxon/Slug (synonym → preferred row with lookalikes)
 * so dual educational stubs (e.g. Rubroboletus satanas empty LA) never win.
 */
export function resolveStudioTaxon(query: string): StudioTaxonCard | null {
  const q = query.trim()
  if (!q) return null
  const qf = fold(q)

  // 0) SSOT preference (canonical synonym map + dual-row bypass)
  const ssot =
    getSpeciesByTaxon(q) ||
    getSpeciesBySlug(normalizeSlugParam(q) || scientificNameToSlug(q) || q) ||
    getSpeciesByTaxon(canonicalTaxonName(q))
  if (ssot) return catalogToCard(ssot)

  // 1) Exact common name (any vernacular)
  const exactCommon = speciesCatalog.find((s) =>
    (s.common_names || []).some((c) => fold(c) === qf),
  )
  if (exactCommon) return catalogToCard(exactCommon)

  // 2) Common name starts-with / includes (prefer shorter names = more specific)
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

  // 3) Ranked search (scientific-ish)
  const ranked = searchCatalogRanked(speciesCatalog, {
    query: q,
    limit: 8,
    boostHighRisk: true,
  })
  const hit =
    ranked.find((s) => fold(s.taxon) === qf) ||
    ranked.find((s) => fold(s.taxon) === fold(canonicalTaxonName(q))) ||
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
  // Canonicalize seed so Rubroboletus satanas matches Boletus satanas pairs
  const f = fold(canonicalTaxonName(seedTaxon) || seedTaxon)
  const out: string[] = []
  for (const pair of CLASSIC_LOOKALIKE_PAIRS) {
    const list = pair.taxa.map((t) => fold(canonicalTaxonName(t) || t))
    if (!list.includes(f)) continue
    for (const t of pair.taxa) {
      const peer = canonicalTaxonName(t) || t
      if (fold(peer) !== f) out.push(peer)
    }
  }
  return out
}

/** Suggest lookalikes: SSOT catalog lookalikes → classic pairs → same family / high risk. */
export function suggestStudioPeers(seedTaxon: string, limit = 8): StudioTaxonCard[] {
  const seed = resolveStudioTaxon(seedTaxon)
  if (!seed) return []
  const seen = new Set<string>([fold(seed.taxon)])
  const out: StudioTaxonCard[] = []

  // 1) Curated SSOT lookalikes on the catalog record (never invented)
  const seedRec =
    getSpeciesByTaxon(seed.taxon) ||
    getSpeciesBySlug(seed.slug) ||
    speciesCatalog.find((s) => fold(s.taxon) === fold(seed.taxon)) ||
    speciesCatalog.find((s) => s.slug === seed.slug)
  for (const t of seedRec?.lookalikes || []) {
    const c = resolveStudioTaxon(t)
    if (!c || seen.has(fold(c.taxon))) continue
    seen.add(fold(c.taxon))
    out.push(c)
    if (out.length >= limit) return out
  }

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

/**
 * Deep-link focus for `/lookalikes?focus=<catalog-slug>`.
 * - Missing/blank → status `none` (default studio empty).
 * - Unknown / non-catalog slug → status `unknown`, empty selection (no crash).
 * - Known catalog slug → seed focus taxon + first curated peer when available
 *   so ImageCompare / learning path can start immediately.
 */
export type FocusSlugStatus = 'none' | 'ok' | 'unknown'

export type FocusSlugResult = {
  status: FocusSlugStatus
  /** Normalized catalog slug when parseable; null when param empty. */
  focusSlug: string | null
  selection: StudioTaxonCard[]
}

export function resolveFocusSlug(
  focusParam: string | null | undefined,
): FocusSlugResult {
  if (focusParam == null) {
    return { status: 'none', focusSlug: null, selection: [] }
  }
  const raw = String(focusParam).trim()
  if (!raw) {
    return { status: 'none', focusSlug: null, selection: [] }
  }

  const focusSlug = normalizeSlugParam(raw)
  if (!focusSlug) {
    return { status: 'unknown', focusSlug: raw, selection: [] }
  }

  // Catalog slug only — free-text / unknown never invents taxa.
  const species = getSpeciesBySlug(focusSlug)
  if (!species) {
    return { status: 'unknown', focusSlug, selection: [] }
  }

  const focus = catalogToCard(species)
  const selection: StudioTaxonCard[] = [focus]
  // Best effort: seed one peer so wipe/side compare is available without extra taps.
  for (const peer of suggestStudioPeers(focus.taxon, 4)) {
    if (selection.length >= LOOKALIKE_STUDIO_MIN) break
    if (selection.some((s) => fold(s.taxon) === fold(peer.taxon))) continue
    selection.push(peer)
  }

  return {
    status: 'ok',
    focusSlug: focus.slug,
    selection: selection.slice(0, LOOKALIKE_STUDIO_MAX),
  }
}
