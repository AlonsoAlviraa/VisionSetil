/**
 * Resolve educational meta for a taxon: season, Iberia, clase educ., family.
 * Joins curated DB + catalog food_class + genus defaults + per-species overrides.
 * Never invents "comestible" without a curated source/override.
 */
import { getMushroomByScientificName } from '../data/mushroomDatabase'
import { familyForTaxon } from '../data/genusFamilyMap'
import {
  EDUC_CLASS_LABEL,
  foodClassToEduc,
  genusOf,
  iberianHeuristic,
  normTaxon,
  parseSeasonFromDescription,
  seasonForGenus,
  SPECIES_META_OVERRIDES,
  type EducClass,
  type IberiaPresence,
} from '../data/speciesMetaDefaults'
import { getFoodQuality } from './foodQuality'
import { toRiskLabel, type RiskLabel } from './riskLabels'

export type ResolvedSpeciesMeta = {
  taxon: string
  genus: string
  family: string
  season: string
  iberian: IberiaPresence
  educ: EducClass
  educLabel: string
  risk: RiskLabel
  riskDisplay: string
}

function educFromEdibilityCode(code: string | null | undefined): EducClass | null {
  return foodClassToEduc(code)
}

/**
 * Prefer severe documented toxicity over "sin documentar".
 * Order: override > foodQuality registry > catalog food_class > desconocido.
 */
function resolveEduc(opts: {
  taxon: string
  foodClass?: string | null
  documented?: string | null
  riskLabel?: string | null
}): EducClass {
  const key = normTaxon(opts.taxon)
  const ov = SPECIES_META_OVERRIDES[key]
  if (ov?.educ) return ov.educ

  const fq = getFoodQuality(opts.taxon)
  if (fq?.food_class) {
    const e = foodClassToEduc(fq.food_class)
    if (e) return e
  }

  const fromCatalog =
    foodClassToEduc(opts.foodClass) || educFromEdibilityCode(opts.documented)
  if (fromCatalog) return fromCatalog

  const risk = toRiskLabel(opts.riskLabel)
  if (risk === 'deadly') return 'mortal'
  if (risk === 'poisonous' || risk === 'toxic') return 'toxica'
  if (risk === 'not_for_consumption_guidance') return 'no_comestible'

  return 'sin_documentar'
}

function resolveSeason(opts: {
  taxon: string
  description?: string | null
  catalogSeason?: string | null
}): string {
  const key = normTaxon(opts.taxon)
  const ov = SPECIES_META_OVERRIDES[key]
  if (ov?.season) return ov.season

  if (opts.catalogSeason && opts.catalogSeason.trim() && opts.catalogSeason !== '—') {
    return opts.catalogSeason.trim()
  }

  const rich = getMushroomByScientificName(opts.taxon)
  if (rich?.season) {
    // Shorten long DB seasons for Setadle cells
    const s = rich.season
    if (s.length <= 28) return s
    const first = s.split(/[.(]/)[0]?.trim()
    if (first && first.length <= 28) return first
    return s.slice(0, 28).trim()
  }

  const fromDesc = parseSeasonFromDescription(opts.description || undefined)
  if (fromDesc) return fromDesc

  return seasonForGenus(genusOf(opts.taxon))
}

function resolveIberian(opts: {
  taxon: string
  commonNames?: string[]
  catalogIberian?: string | null
}): IberiaPresence {
  const key = normTaxon(opts.taxon)
  const ov = SPECIES_META_OVERRIDES[key]
  if (ov?.iberian) return ov.iberian

  const raw = (opts.catalogIberian || '').trim()
  if (
    raw &&
    raw !== '—' &&
    ['Icono', 'Frecuente', 'Presente', 'Mediterránea', 'Atlántica', 'Montaña', 'Escasa'].includes(
      raw,
    )
  ) {
    return raw as IberiaPresence
  }

  return iberianHeuristic(opts.taxon, opts.commonNames)
}

export function resolveSpeciesMeta(input: {
  taxon: string
  family?: string | null
  risk_label?: string | null
  food_class?: string | null
  documented_edibility?: string | null
  description?: string | null
  common_names?: string[]
  season?: string | null
  iberian_relevance?: string | null
}): ResolvedSpeciesMeta {
  const taxon = input.taxon.trim()
  const genus = genusOf(taxon)
  const family = familyForTaxon(taxon, input.family) || input.family?.trim() || '—'
  const season = resolveSeason({
    taxon,
    description: input.description,
    catalogSeason: input.season,
  })
  const iberian = resolveIberian({
    taxon,
    commonNames: input.common_names,
    catalogIberian: input.iberian_relevance,
  })
  const educ = resolveEduc({
    taxon,
    foodClass: input.food_class,
    documented: input.documented_edibility,
    riskLabel: input.risk_label,
  })
  const risk = toRiskLabel(input.risk_label)

  return {
    taxon,
    genus: genus || '—',
    family: family || '—',
    season,
    iberian,
    educ,
    educLabel: EDUC_CLASS_LABEL[educ],
    risk,
    riskDisplay: risk,
  }
}
