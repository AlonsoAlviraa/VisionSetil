/**
 * Season Radar ES — educational season label + sample taxa (S6).
 * Not a harvest guide; orientation only.
 */
import {
  loadSpeciesCatalog,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { toRiskLabel } from './riskLabels'

/** Ensure catalog is hydrated before season lookups (code-split). */
export async function ensureSeasonCatalog(): Promise<CatalogSpecies[]> {
  return loadSpeciesCatalog()
}

export type SeasonId = 'primavera' | 'verano' | 'otono' | 'invierno'

export type SeasonInfo = {
  id: SeasonId
  labelEs: string
  months: string
  note: string
}

/** Fixed educational maps (Spain temperate / mediterranean). */
export const SEASON_META: Record<SeasonId, SeasonInfo> = {
  primavera: {
    id: 'primavera',
    labelEs: 'Primavera',
    months: 'Marzo – Mayo',
    note: 'Temporada corta; colmenillas y setas de prado. Solo orientación educativa.',
  },
  verano: {
    id: 'verano',
    labelEs: 'Verano',
    months: 'Junio – Agosto',
    note: 'Depende de tormentas estivales. Observa rebozuelos y oronjas en zonas cálidas.',
  },
  otono: {
    id: 'otono',
    labelEs: 'Otoño',
    months: 'Septiembre – Noviembre',
    note: 'Mayor diversidad. Incluye taxones de alto riesgo: no es permiso de recolección.',
  },
  invierno: {
    id: 'invierno',
    labelEs: 'Invierno',
    months: 'Diciembre – Febrero',
    note: 'Pocas especies; trufas y ostras en contexto educativo.',
  },
}

/** Curated educational taxa per season (scientific names in catalog when possible). */
export const SEASON_TAXON_SEEDS: Record<SeasonId, string[]> = {
  primavera: [
    'Morchella esculenta',
    'Calocybe gambosa',
    'Agaricus campestris',
    'Verpa bohemica',
    'Sarcoscypha coccinea',
  ],
  verano: [
    'Cantharellus cibarius',
    'Amanita caesarea',
    'Russula virescens',
    'Boletus aereus',
    'Amanita phalloides',
  ],
  otono: [
    'Boletus edulis',
    'Lactarius deliciosus',
    'Amanita phalloides',
    'Hydnum repandum',
    'Macrolepiota procera',
    'Galerina marginata',
    'Hypholoma fasciculare',
  ],
  invierno: [
    'Tuber melanosporum',
    'Pleurotus ostreatus',
    'Flammulina velutipes',
    'Hygrophorus marzuolus',
  ],
}

export function seasonFromMonth(month1to12: number): SeasonId {
  if (month1to12 >= 3 && month1to12 <= 5) return 'primavera'
  if (month1to12 >= 6 && month1to12 <= 8) return 'verano'
  if (month1to12 >= 9 && month1to12 <= 11) return 'otono'
  return 'invierno'
}

export function currentSeason(date: Date = new Date()): SeasonInfo {
  const id = seasonFromMonth(date.getMonth() + 1)
  return SEASON_META[id]
}

export type SeasonTaxonCard = {
  taxon: string
  slug: string
  common_name: string
  risk_label: string
  in_catalog: boolean
}

function findTaxon(name: string): CatalogSpecies | undefined {
  const lower = name.toLowerCase()
  return speciesCatalog.find((s) => s.taxon.toLowerCase() === lower)
}

/** Resolve educational taxa for a season (catalog-enriched when possible). */
export function taxaForSeason(seasonId: SeasonId, limit = 8): SeasonTaxonCard[] {
  const seeds = SEASON_TAXON_SEEDS[seasonId] || []
  const out: SeasonTaxonCard[] = []
  for (const name of seeds) {
    if (out.length >= limit) break
    const cat = findTaxon(name)
    out.push({
      taxon: cat?.taxon ?? name,
      slug: cat?.slug ?? name.toLowerCase().replace(/\s+/g, '-'),
      common_name: cat?.common_names[0] || 'Sin nombre común local',
      risk_label: cat?.risk_label ?? 'dangerous_or_unknown',
      in_catalog: Boolean(cat),
    })
  }
  // Prefer showing at least one high-risk educational taxon in autumn
  if (seasonId === 'otono') {
    const hasDeadly = out.some((t) => toRiskLabel(t.risk_label) === 'deadly')
    if (!hasDeadly) {
      const deadly = speciesCatalog.find((s) => toRiskLabel(s.risk_label) === 'deadly')
      if (deadly) {
        out.unshift({
          taxon: deadly.taxon,
          slug: deadly.slug,
          common_name: deadly.common_names[0] || deadly.taxon,
          risk_label: deadly.risk_label,
          in_catalog: true,
        })
      }
    }
  }
  return out.slice(0, limit)
}

export function seasonRadarSnapshot(date: Date = new Date()) {
  const season = currentSeason(date)
  return {
    season,
    taxa: taxaForSeason(season.id),
    disclaimer:
      'Radar educativo de temporada. No es guía de recolección ni permiso de consumo.',
  }
}
