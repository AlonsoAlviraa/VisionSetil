/**
 * Educational phenology helpers for species detail (season bars).
 * Orientation only — never a harvest calendar or consumption guide.
 *
 * Competitor inspiration: encyclopedia season cards (Shroomify / field guides).
 */
import {
  SEASON_META,
  seasonFromMonth,
  type SeasonId,
} from './seasonRadar'

export const MONTH_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
export type MonthId = (typeof MONTH_IDS)[number]

export const MONTH_LABELS_ES: Record<MonthId, string> = {
  1: 'Ene',
  2: 'Feb',
  3: 'Mar',
  4: 'Abr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Ago',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dic',
}

export const MONTH_LABELS_EN: Record<MonthId, string> = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Aug',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dec',
}

const SEASON_TOKEN: Array<{ re: RegExp; id: SeasonId }> = [
  { re: /primavera|spring/i, id: 'primavera' },
  { re: /verano|summer/i, id: 'verano' },
  { re: /oto[nñ]o|autumn|fall/i, id: 'otono' },
  { re: /invierno|winter/i, id: 'invierno' },
]

/** Months belonging to each educational season bucket (Spain temperate). */
export const SEASON_MONTHS: Record<SeasonId, MonthId[]> = {
  primavera: [3, 4, 5],
  verano: [6, 7, 8],
  otono: [9, 10, 11],
  invierno: [12, 1, 2],
}

/**
 * Parse free-text season labels (catalog ES/EN) into active season ids.
 * Empty / unknown → no months active (honest empty bar).
 */
export function parseSeasonTokens(season: string | null | undefined): SeasonId[] {
  if (!season || !String(season).trim()) return []
  const text = String(season)
  const found: SeasonId[] = []
  for (const { re, id } of SEASON_TOKEN) {
    if (re.test(text) && !found.includes(id)) found.push(id)
  }
  // "todo el año" / all year
  if (/todo\s+el\s+a[nñ]o|all\s*year|year[- ]?round/i.test(text)) {
    return ['primavera', 'verano', 'otono', 'invierno']
  }
  return found
}

export function activeMonthsFromSeason(season: string | null | undefined): Set<MonthId> {
  const seasons = parseSeasonTokens(season)
  const months = new Set<MonthId>()
  for (const s of seasons) {
    for (const m of SEASON_MONTHS[s]) months.add(m)
  }
  return months
}

export type PhenologyBar = {
  months: Array<{
    month: MonthId
    label: string
    active: boolean
    isCurrent: boolean
  }>
  seasons: SeasonId[]
  seasonLabels: string[]
  currentSeasonId: SeasonId
  disclaimer: string
}

/**
 * Build a 12-month educational phenology bar for a species season string.
 */
export function buildPhenologyBar(
  season: string | null | undefined,
  opts?: { locale?: string; now?: Date },
): PhenologyBar {
  const locale = (opts?.locale || 'es').toLowerCase()
  const now = opts?.now ?? new Date()
  const currentMonth = (now.getMonth() + 1) as MonthId
  const currentSeasonId = seasonFromMonth(currentMonth)
  const active = activeMonthsFromSeason(season)
  const seasons = parseSeasonTokens(season)
  const labels = locale.startsWith('en') ? MONTH_LABELS_EN : MONTH_LABELS_ES

  return {
    months: MONTH_IDS.map((month) => ({
      month,
      label: labels[month],
      active: active.has(month),
      isCurrent: month === currentMonth,
    })),
    seasons,
    seasonLabels: seasons.map((id) =>
      locale.startsWith('en')
        ? ({
            primavera: 'Spring',
            verano: 'Summer',
            otono: 'Autumn',
            invierno: 'Winter',
          }[id] as string)
        : SEASON_META[id].labelEs,
    ),
    currentSeasonId,
    disclaimer: locale.startsWith('en')
      ? 'Educational season bar only. Not a harvest calendar or permission to collect/eat.'
      : 'Barra de temporada educativa. No es calendario de recolección ni permiso de consumo.',
  }
}

export function isInSeasonNow(
  season: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const month = (now.getMonth() + 1) as MonthId
  return activeMonthsFromSeason(season).has(month)
}
