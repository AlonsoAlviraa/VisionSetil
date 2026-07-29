/**
 * Educational morphology traits for encyclopedia study shortlists.
 * Family/genus heuristics only — never consumption permission or forage advice.
 *
 * Policy: orientation only · never edible green-lights · filters are study aids.
 */
import type { CatalogSpecies } from '../data/speciesCatalog'
import { familyForTaxon } from '../data/genusFamilyMap'

/** Study trait ids (encyclopedia shortlists). */
export type StudyTraitId =
  | 'gills'
  | 'pores'
  | 'folds'
  | 'teeth'
  | 'ascomycete'
  | 'other'

export type StudyTraitOption = {
  id: StudyTraitId
  /** i18n key under encyclopedia.trait.* */
  labelKey: string
  labelFallback: string
  /** Short educational blurb key */
  blurbKey: string
  blurbFallback: string
}

export const STUDY_TRAIT_OPTIONS: readonly StudyTraitOption[] = [
  {
    id: 'gills',
    labelKey: 'encyclopedia.trait.gills',
    labelFallback: 'Láminas',
    blurbKey: 'encyclopedia.trait.gillsBlurb',
    blurbFallback: 'Himenio laminar (agaricales y afines) — estudio, no consumo',
  },
  {
    id: 'pores',
    labelKey: 'encyclopedia.trait.pores',
    labelFallback: 'Poros',
    blurbKey: 'encyclopedia.trait.poresBlurb',
    blurbFallback: 'Tubos/poros (boletales, poliporos) — estudio, no consumo',
  },
  {
    id: 'folds',
    labelKey: 'encyclopedia.trait.folds',
    labelFallback: 'Pliegues',
    blurbKey: 'encyclopedia.trait.foldsBlurb',
    blurbFallback: 'Pliegues (cantarelas) — no son láminas; estudio only',
  },
  {
    id: 'teeth',
    labelKey: 'encyclopedia.trait.teeth',
    labelFallback: 'Aguijones',
    blurbKey: 'encyclopedia.trait.teethBlurb',
    blurbFallback: 'Himenio hidnoide (aguijones) — estudio, no consumo',
  },
  {
    id: 'ascomycete',
    labelKey: 'encyclopedia.trait.ascomycete',
    labelFallback: 'Ascomicetos',
    blurbKey: 'encyclopedia.trait.ascomyceteBlurb',
    blurbFallback: 'Morchellas, helvelas, trufas… — confusiones graves; solo estudio',
  },
  {
    id: 'other',
    labelKey: 'encyclopedia.trait.other',
    labelFallback: 'Otros',
    blurbKey: 'encyclopedia.trait.otherBlurb',
    blurbFallback: 'Gasteroides, gelatinosos, coraloides… — estudio, no consumo',
  },
] as const

/** Families typically with gills (laminate hymenium). */
const GILL_FAMILIES = new Set(
  [
    'Agaricaceae',
    'Amanitaceae',
    'Russulaceae',
    'Tricholomataceae',
    'Strophariaceae',
    'Cortinariaceae',
    'Inocybaceae',
    'Entolomataceae',
    'Psathyrellaceae',
    'Pluteaceae',
    'Physalacriaceae',
    'Mycenaceae',
    'Marasmiaceae',
    'Omphalotaceae',
    'Hymenogastraceae',
    'Pleurotaceae',
    'Bolbitiaceae',
    'Hygrophoraceae',
    'Lyophyllaceae',
    'Crepidotaceae',
    'Schizophyllaceae',
    'Paxillaceae',
    'Tapinellaceae',
    'Gomphidiaceae',
  ].map((f) => f.toLowerCase()),
)

/** Pore / tube families (boletes + polypores). */
const PORE_FAMILIES = new Set(
  [
    'Boletaceae',
    'Suillaceae',
    'Polyporaceae',
    'Fomitopsidaceae',
    'Ganodermataceae',
    'Fistulinaceae',
    'Gloeophyllaceae',
    'Rhizopogonaceae',
  ].map((f) => f.toLowerCase()),
)

/** False gills / folds (chanterelles). */
const FOLD_FAMILIES = new Set(['Cantharellaceae'].map((f) => f.toLowerCase()))

/** Teeth / spines. */
const TEETH_FAMILIES = new Set(
  ['Hydnaceae', 'Bankeraceae', 'Hericiaceae'].map((f) => f.toLowerCase()),
)

/** Ascomycete / cup / morel-like study group. */
const ASCO_FAMILIES = new Set(
  [
    'Morchellaceae',
    'Discinaceae',
    'Helvellaceae',
    'Pezizaceae',
    'Pyronemataceae',
    'Sarcoscyphaceae',
    'Tuberaceae',
  ].map((f) => f.toLowerCase()),
)

/** Explicit “other” study buckets (not gills/pores primary). */
const OTHER_FAMILIES = new Set(
  [
    'Sclerodermataceae',
    'Geastraceae',
    'Diplocystaceae',
    'Phallaceae',
    'Sparassidaceae',
    'Stereaceae',
    'Auriculariaceae',
    'Tremellaceae',
    'Dacrymycetaceae',
    'Thelephoraceae',
    'Clavulinaceae',
    'Gomphaceae',
    'Clavariadelphaceae',
    'Clavariaceae',
  ].map((f) => f.toLowerCase()),
)

function normalizeFamily(family: string | null | undefined): string {
  return String(family || '')
    .trim()
    .toLowerCase()
}

/**
 * Resolve educational morphology trait for a catalog row.
 * Uses family when present; falls back to genus→family map.
 * Unknown families default to `other` (study bucket), never invents safety.
 */
export function studyTraitForSpecies(
  species: Pick<CatalogSpecies, 'taxon' | 'family'>,
): StudyTraitId {
  const family =
    normalizeFamily(species.family) ||
    normalizeFamily(familyForTaxon(species.taxon, species.family))

  if (!family) return 'other'
  if (GILL_FAMILIES.has(family)) return 'gills'
  if (PORE_FAMILIES.has(family)) return 'pores'
  if (FOLD_FAMILIES.has(family)) return 'folds'
  if (TEETH_FAMILIES.has(family)) return 'teeth'
  if (ASCO_FAMILIES.has(family)) return 'ascomycete'
  if (OTHER_FAMILIES.has(family)) return 'other'
  return 'other'
}

export function matchesStudyTrait(
  species: Pick<CatalogSpecies, 'taxon' | 'family'>,
  trait: StudyTraitId | 'all',
): boolean {
  if (trait === 'all') return true
  return studyTraitForSpecies(species) === trait
}

export function filterByStudyTrait<T extends Pick<CatalogSpecies, 'taxon' | 'family'>>(
  list: T[],
  trait: StudyTraitId | 'all',
): T[] {
  if (trait === 'all') return list
  return list.filter((s) => studyTraitForSpecies(s) === trait)
}

export type StudyTraitCount = { id: StudyTraitId | 'all'; count: number }

/** Counts per trait for toolbar chips (orientation study only). */
export function countByStudyTrait(
  species: Array<Pick<CatalogSpecies, 'taxon' | 'family'>>,
): Record<StudyTraitId | 'all', number> {
  const counts: Record<StudyTraitId | 'all', number> = {
    all: species.length,
    gills: 0,
    pores: 0,
    folds: 0,
    teeth: 0,
    ascomycete: 0,
    other: 0,
  }
  for (const s of species) {
    counts[studyTraitForSpecies(s)] += 1
  }
  return counts
}

/** Policy line for trait filter chrome — never forage. */
export const STUDY_TRAIT_POLICY_ES =
  'Filtros de estudio morfológico — solo orientación, nunca permiso de consumo.'
