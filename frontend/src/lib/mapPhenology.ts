/**
 * Map phenology helpers (M3) — educational only.
 * Month match, phenology score blend, habitat chips, story route.
 * Not forage permission or food-safety advice.
 */

import { seasonFromMonth, type SeasonId } from './seasonRadar'

/** Calendar month 1–12. */
export type Month1to12 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export const MONTH_LABELS_ES: Record<Month1to12, string> = {
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

export const MONTH_NAMES_ES_FULL: Record<Month1to12, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
}

const MONTH_NAME_TO_NUM: Record<string, Month1to12> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  // Short / variants
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
}

/** Canonical habitat chip ids derived from free-text zone.habitat. */
export type HabitatChipId =
  | 'hayedo'
  | 'pinar'
  | 'robledal'
  | 'pradera'
  | 'dehesa'
  | 'castanar'
  | 'abetal'
  | 'encinar'
  | 'laurisilva'
  | 'mixto'

export type HabitatChipDef = {
  id: HabitatChipId
  /** Spanish UI label */
  labelEs: string
  /** Patterns matched against normalized habitat text (OR). */
  patterns: RegExp[]
}

export const HABITAT_CHIPS: readonly HabitatChipDef[] = [
  {
    id: 'hayedo',
    labelEs: 'Hayedo',
    patterns: [/hayedo/, /hayedos/, /fageda/],
  },
  {
    id: 'pinar',
    labelEs: 'Pinar',
    patterns: [/pinar/, /pinares/, /pino/],
  },
  {
    id: 'robledal',
    labelEs: 'Robledal',
    patterns: [/robledal/, /robledales/, /roble/, /meloja/],
  },
  {
    id: 'pradera',
    labelEs: 'Pradera',
    patterns: [/pradera/, /prado/, /pastizal/, /pastizales/],
  },
  {
    id: 'dehesa',
    labelEs: 'Dehesa',
    patterns: [/dehesa/, /dehesas/],
  },
  {
    id: 'castanar',
    labelEs: 'Castañar',
    patterns: [/castanar/, /castanares/, /castano/, /castanos/],
  },
  {
    id: 'abetal',
    labelEs: 'Abetal',
    patterns: [/abetal/, /abetales/, /abeto/],
  },
  {
    id: 'encinar',
    labelEs: 'Encinar',
    patterns: [/encinar/, /encinares/, /carrascal/, /carrascales/, /alcorno/],
  },
  {
    id: 'laurisilva',
    labelEs: 'Laurisilva',
    patterns: [/laurisilva/, /tilale/],
  },
  {
    id: 'mixto',
    labelEs: 'Mixto',
    patterns: [/mixto/, /mixtos/],
  },
] as const

const SEASON_MONTHS: Record<SeasonId, Month1to12[]> = {
  primavera: [3, 4, 5],
  verano: [6, 7, 8],
  otono: [9, 10, 11],
  invierno: [12, 1, 2],
}

function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function clampMonth(m: number): Month1to12 {
  if (!Number.isFinite(m)) return 1
  const n = Math.round(m)
  if (n < 1) return 1
  if (n > 12) return 12
  return n as Month1to12
}

export function currentMonth1to12(date: Date = new Date()): Month1to12 {
  return clampMonth(date.getMonth() + 1)
}

/**
 * Expand a free-text zone.season into typical months (1–12).
 * Uses Spanish season names, month names, and simple ranges ("septiembre a diciembre").
 * Educational heuristic only — not phenology science.
 */
export function monthsFromSeasonText(seasonText: string | null | undefined): Month1to12[] {
  if (!seasonText || !seasonText.trim()) {
    // Default Iberian mycological peak when unknown
    return [...SEASON_MONTHS.otono]
  }
  const raw = seasonText
  const n = normalizeText(raw)
  const months = new Set<Month1to12>()

  // "Finales de verano" is a shoulder phrase (Aug–Sep), not full summer.
  // Strip it before matching the bare "verano" keyword so we do not expand 6–8.
  const finalesVerano =
    /finales?\s+de\s+verano/.test(n) || /fin\s+de\s+verano/.test(n)
  const nForSeasons = n
    .replace(/finales?\s+de\s+verano/g, ' ')
    .replace(/fin\s+de\s+verano/g, ' ')

  // Season keywords
  if (/\bprimavera\b/.test(nForSeasons) || /\bmorchell/.test(n)) {
    for (const m of SEASON_MONTHS.primavera) months.add(m)
  }
  if (/\bverano\b/.test(nForSeasons) || /\bestival/.test(nForSeasons)) {
    for (const m of SEASON_MONTHS.verano) months.add(m)
  }
  if (/\botono\b/.test(nForSeasons) || /\bautumn\b/.test(nForSeasons)) {
    for (const m of SEASON_MONTHS.otono) months.add(m)
  }
  if (/\binvierno\b/.test(nForSeasons) || /\btrufa\b/.test(n)) {
    for (const m of SEASON_MONTHS.invierno) months.add(m)
  }
  if (finalesVerano) {
    months.add(8)
    months.add(9)
  }

  // Explicit month names
  for (const [name, num] of Object.entries(MONTH_NAME_TO_NUM)) {
    if (name.length < 3) continue // skip ultra-short in free text to reduce noise
    const re = new RegExp(`\\b${name}\\b`)
    if (re.test(n)) months.add(num)
  }

  // Ranges: "septiembre a diciembre", "octubre–noviembre", "sep-nov"
  const rangeRe =
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s*(?:a|al|hasta|-|–|—)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g
  let match: RegExpExecArray | null
  while ((match = rangeRe.exec(n)) !== null) {
    const a = MONTH_NAME_TO_NUM[match[1]]
    const b = MONTH_NAME_TO_NUM[match[2]]
    if (a && b) {
      let cur = a
      // Walk inclusive, wrap at year boundary if needed
      for (let i = 0; i < 12; i++) {
        months.add(cur)
        if (cur === b) break
        cur = (cur === 12 ? 1 : cur + 1) as Month1to12
      }
    }
  }

  if (months.size === 0) {
    // Fallback: map calendar season from current wording failures → otoño default
    return [...SEASON_MONTHS.otono]
  }
  return Array.from(months).sort((a, b) => a - b)
}

/**
 * Season-match ladder (monotonic shoulder, educational heuristic):
 *   in-season            → 1.00
 *   adjacent month       → 0.55  (shoulder; always ≥ macro residual)
 *   same macro-season    → 0.35  (partial season text residual, e.g. only [8,9])
 *   off-season           → 0.12
 *
 * Order is intentional: adjacent must not lose to same-macro non-adjacent months.
 */
export const SEASON_MATCH_IN = 1
export const SEASON_MATCH_ADJACENT = 0.55
export const SEASON_MATCH_MACRO = 0.35
export const SEASON_MATCH_OFF = 0.12

export function seasonMatchForMonth(
  seasonText: string | null | undefined,
  month: number,
): number {
  const m = clampMonth(month)
  const months = monthsFromSeasonText(seasonText)
  if (months.includes(m)) return SEASON_MATCH_IN

  // Adjacent (circular calendar) — checked before macro residual
  const prev = (m === 1 ? 12 : m - 1) as Month1to12
  const next = (m === 12 ? 1 : m + 1) as Month1to12
  if (months.includes(prev) || months.includes(next)) return SEASON_MATCH_ADJACENT

  // Same macro-season residual (e.g. zone months [8,9], query June in verano)
  const selectedSeason = seasonFromMonth(m)
  const overlap = months.some((x) => seasonFromMonth(x) === selectedSeason)
  if (overlap) return SEASON_MATCH_MACRO

  return SEASON_MATCH_OFF
}

export function isInSeason(
  seasonText: string | null | undefined,
  month: number,
): boolean {
  return seasonMatchForMonth(seasonText, month) >= 0.9
}

/**
 * Phenology display score (0–100), educational only.
 *
 * Formula (document for M3.2):
 *   phenologyScore = round(100 * (W_S * seasonMatch + W_W * weatherNorm))
 *   W_S = 0.55, W_W = 0.45
 *   seasonMatch ∈ [0,1] from zone.season vs selected month
 *   weatherNorm = weatherScore/100 when known, else 0.5 (neutral placeholder)
 *
 * Halo/marker opacity can use seasonMatch or phenologyScore/100.
 * Labels: “Índice de condiciones meteorológicas orientativo” — never forage advice.
 */
export const PHENOLOGY_SEASON_WEIGHT = 0.55
export const PHENOLOGY_WEATHER_WEIGHT = 0.45

export function weatherNorm(weatherScore: number | null | undefined): number {
  if (weatherScore == null || Number.isNaN(weatherScore)) return 0.5
  return Math.min(1, Math.max(0, weatherScore / 100))
}

export function phenologyScore(
  seasonText: string | null | undefined,
  month: number,
  weatherScore: number | null | undefined,
): number {
  const s = seasonMatchForMonth(seasonText, month)
  const w = weatherNorm(weatherScore)
  const raw =
    PHENOLOGY_SEASON_WEIGHT * s + PHENOLOGY_WEATHER_WEIGHT * w
  return Math.round(Math.min(100, Math.max(0, raw * 100)))
}

/**
 * Marker/halo opacity blend for phenology layer.
 * In-season: 0.85–1.0; shoulder: ~0.5; off: ~0.22. Weather mildly boosts opacity.
 */
export function phenologyOpacity(
  seasonText: string | null | undefined,
  month: number,
  weatherScore: number | null | undefined,
): number {
  const s = seasonMatchForMonth(seasonText, month)
  const w = weatherNorm(weatherScore)
  // Base from season, small weather lift
  const base = 0.18 + s * 0.72 + w * 0.1
  return Math.min(1, Math.max(0.15, base))
}

export type PhenologyRankRow = {
  id: string
  score: number
  inSeason: boolean
  seasonMatch: number
}

/** Rank zones by phenology score desc (stable id tie-break). */
export function rankZonesByPhenology<
  T extends { id: string; season?: string },
>(
  zones: readonly T[],
  month: number,
  weatherScores: Record<string, number | null | undefined>,
): PhenologyRankRow[] {
  const rows: PhenologyRankRow[] = zones.map((z) => {
    const seasonMatch = seasonMatchForMonth(z.season, month)
    return {
      id: z.id,
      score: phenologyScore(z.season, month, weatherScores[z.id]),
      inSeason: seasonMatch >= 0.9,
      seasonMatch,
    }
  })
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.seasonMatch - a.seasonMatch ||
      a.id.localeCompare(b.id),
  )
  return rows
}

/** Top N hotspots by phenology (season × weather). */
export function topPhenologyHotspots(
  zoneIds: readonly string[],
  seasons: Record<string, string | undefined>,
  weatherScores: Record<string, number | null | undefined>,
  month: number,
  limit = 5,
): PhenologyRankRow[] {
  const zones = zoneIds.map((id) => ({ id, season: seasons[id] }))
  return rankZonesByPhenology(zones, month, weatherScores).slice(
    0,
    Math.max(0, limit),
  )
}

export function habitatChipsForText(
  habitat: string | null | undefined,
): HabitatChipId[] {
  if (!habitat) return []
  const n = normalizeText(habitat)
  // Normalize ñ after NFD strip becomes n — castanar patterns already use n
  const hits: HabitatChipId[] = []
  for (const chip of HABITAT_CHIPS) {
    if (chip.patterns.some((re) => re.test(n))) hits.push(chip.id)
  }
  return hits
}

/** True if zone matches any of the selected habitat chip ids (OR). Empty selection = all. */
export function zoneMatchesHabitatFilter(
  habitat: string | null | undefined,
  selected: readonly HabitatChipId[],
): boolean {
  if (!selected.length) return true
  const chips = habitatChipsForText(habitat)
  if (!chips.length) return false
  return selected.some((id) => chips.includes(id))
}

export function filterZonesByHabitat<T extends { habitat: string }>(
  zones: readonly T[],
  selected: readonly HabitatChipId[],
): T[] {
  if (!selected.length) return [...zones]
  return zones.filter((z) => zoneMatchesHabitatFilter(z.habitat, selected))
}

/** Count zones per habitat chip (for UI badges). */
export function habitatChipCounts(
  zones: readonly { habitat: string }[],
): Record<HabitatChipId, number> {
  const counts = Object.fromEntries(
    HABITAT_CHIPS.map((c) => [c.id, 0]),
  ) as Record<HabitatChipId, number>
  for (const z of zones) {
    const chips = habitatChipsForText(z.habitat)
    // Count each chip once per zone
    const seen = new Set(chips)
    for (const id of seen) counts[id]++
  }
  return counts
}

/**
 * Species thumbs for zone card hero (up to `max`, default 6).
 * Prefer 3–6 when data allows; short lists return whatever is available.
 * `max` is the hard cap; there is no enforced minimum.
 */
export function zoneHeroSpecies(
  species: readonly string[],
  max = 6,
): string[] {
  if (!species?.length) return []
  const lim = Math.max(1, Math.min(6, max))
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of species) {
    const key = s.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(s.trim())
    if (out.length >= lim) break
  }
  return out
}

/** Localized month label via Intl (long or short). */
export function monthLabel(
  month: number,
  locale: string,
  style: 'long' | 'short' = 'long',
): string {
  const m = clampMonth(month)
  try {
    return new Intl.DateTimeFormat(locale || 'es', { month: style }).format(
      new Date(Date.UTC(2020, m - 1, 1)),
    )
  } catch {
    return style === 'short' ? MONTH_LABELS_ES[m] : MONTH_NAMES_ES_FULL[m]
  }
}

/** Cap for extra in-season halo circles in simple map mode (perf). */
export const SIMPLE_PHENO_HALO_CAP = 12

// ─── Story mode (educational route — not a forage path) ───

export type StoryStop = {
  /** Stable story id */
  id: string
  /** Preferred zone id in catalog */
  zoneId: string
  /** Fallback zone ids if primary missing */
  fallbackZoneIds?: string[]
  /** Short Spanish narration (educational ecology) */
  narrationEs: string
  /** Optional English */
  narrationEn?: string
}

/**
 * Classic educational Iberian mycological landscapes.
 * Narration describes ecology/season — NEVER forage routes or "best places to pick".
 */
export const STORY_ROUTE_STOPS: readonly StoryStop[] = [
  {
    id: 'soria',
    zoneId: 'soria-pinares',
    fallbackZoneIds: ['soria-pinares-lobo'],
    narrationEs:
      'Los pinares albares de Soria son un paisaje clásico de estudio: suelos arenosos, simbiosis con pinos y fructificaciones típicas de otoño. Observa el hábitat, no busques setas para recolectar.',
    narrationEn:
      'Soria’s Scots pine woods are a classic study landscape: sandy soils, pine symbiosis and typical autumn fruiting. Observe habitat — do not forage.',
  },
  {
    id: 'picos',
    zoneId: 'asturias-oriental',
    fallbackZoneIds: ['asturias-redes', 'asturias-somiedo'],
    narrationEs:
      'Picos de Europa y hayedos atlánticos concentran alta diversidad fúngica. El clima húmedo y la hojarasca marcan la fenología. Ruta educativa de paisaje — sin permiso de recolección.',
    narrationEn:
      'Picos de Europa beech forests hold high fungal diversity. Humidity and leaf litter shape phenology. Educational landscape tour — no forage permission.',
  },
  {
    id: 'pirineo',
    zoneId: 'pirineo-aragones',
    fallbackZoneIds: ['pirineo-catalan', 'pirineo-navarro', 'huesca-ordesa-entorno'],
    narrationEs:
      'El Pirineo combina abetales, pinares de montaña y prados de altura. Cada piso altitudinal enseña un hábitat distinto. Solo orientación ecológica de temporada.',
    narrationEn:
      'The Pyrenees combine fir forests, mountain pines and high meadows. Each altitude band is a different habitat lesson. Season ecology orientation only.',
  },
]

export type ResolvedStoryStop = StoryStop & {
  resolvedZoneId: string
}

/** Resolve story stops against available zone ids. */
export function resolveStoryRoute(
  availableIds: ReadonlySet<string> | readonly string[],
): ResolvedStoryStop[] {
  const set =
    availableIds instanceof Set
      ? availableIds
      : new Set(availableIds)
  const out: ResolvedStoryStop[] = []
  for (const stop of STORY_ROUTE_STOPS) {
    const candidates = [stop.zoneId, ...(stop.fallbackZoneIds ?? [])]
    const hit = candidates.find((id) => set.has(id))
    if (!hit) continue
    out.push({ ...stop, resolvedZoneId: hit })
  }
  return out
}

export function toggleHabitatChip(
  selected: readonly HabitatChipId[],
  chip: HabitatChipId,
): HabitatChipId[] {
  if (selected.includes(chip)) return selected.filter((c) => c !== chip)
  return [...selected, chip]
}
