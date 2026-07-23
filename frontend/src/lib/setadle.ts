/**
 * Setadle — LoLdle-style daily mushroom guessing (educational only).
 * Modes: classic | clue | trait | emoji | photo
 */
import {
  loadSpeciesCatalog,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { toRiskLabel, type RiskLabel } from './riskLabels'

export type SetadleMode = 'classic' | 'clue' | 'trait' | 'emoji' | 'photo'

export const SETADLE_MODES: Array<{
  id: SetadleMode
  title: string
  blurb: string
  emoji: string
}> = [
  {
    id: 'classic',
    title: 'Clásico',
    blurb: 'Pistas en cada intento: familia, género, riesgo…',
    emoji: '🍄',
  },
  {
    id: 'clue',
    title: 'Pista',
    blurb: 'Una frase de la ficha. Adivina la especie.',
    emoji: '💬',
  },
  {
    id: 'trait',
    title: 'Rasgo',
    blurb: 'Un carácter morfológico o clave de campo.',
    emoji: '🔍',
  },
  {
    id: 'emoji',
    title: 'Emoji',
    blurb: 'Adivina con un set de emojis de riesgo y hábitat.',
    emoji: '😀',
  },
  {
    id: 'photo',
    title: 'Foto',
    blurb: 'Recorte de foto; se aleja con cada fallo.',
    emoji: '📷',
  },
]

export type CellTone = 'correct' | 'partial' | 'wrong'

export type AttrKey =
  | 'family'
  | 'genus'
  | 'risk'
  | 'edibility'
  | 'iberian'
  | 'season'

export type ClassicGuessRow = {
  taxon: string
  slug: string
  common: string
  cells: Array<{ key: AttrKey; label: string; value: string; tone: CellTone }>
  won: boolean
}

export type SetadleSpecies = {
  taxon: string
  slug: string
  common: string
  family: string
  genus: string
  risk: RiskLabel
  edibility: string
  iberian: string
  season: string
  tagline: string
  description: string
  trait: string
  emojis: string
  risk_raw: string
}

const ATTR_LABELS: Record<AttrKey, string> = {
  family: 'Familia',
  genus: 'Género',
  risk: 'Riesgo',
  edibility: 'Clase educ.',
  iberian: 'Iberia',
  season: 'Temporada',
}

const RISK_ORDER: RiskLabel[] = [
  'deadly',
  'poisonous',
  'toxic',
  'dangerous_or_unknown',
  'unknown_or_risky',
  'not_for_consumption_guidance',
]

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Deterministic hash for daily seed */
export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seasonLabel(sp: CatalogSpecies): string {
  const s = sp as CatalogSpecies & { season?: unknown }
  const season = s.season
  if (!season) return '—'
  if (typeof season === 'string') return season
  if (typeof season === 'object' && season && 'es' in season) {
    return String((season as { es?: string }).es || '—')
  }
  return '—'
}

function firstTrait(sp: CatalogSpecies): string {
  const rec = sp as CatalogSpecies & {
    key_features?: string[] | Record<string, string>
    morphology?: Record<string, string> | string
  }
  if (Array.isArray(rec.key_features) && rec.key_features[0]) {
    return String(rec.key_features[0])
  }
  if (rec.key_features && typeof rec.key_features === 'object') {
    const vals = Object.values(rec.key_features)
    if (vals[0]) return String(vals[0])
  }
  if (typeof rec.morphology === 'string' && rec.morphology.trim()) {
    return rec.morphology.trim().slice(0, 120)
  }
  if (rec.morphology && typeof rec.morphology === 'object') {
    const v = Object.values(rec.morphology)[0]
    if (v) return String(v).slice(0, 120)
  }
  const desc = (rec as { description?: Record<string, string> | string }).description
  if (typeof desc === 'string') return desc.slice(0, 100)
  if (desc && typeof desc === 'object' && desc.es) return String(desc.es).slice(0, 100)
  return 'Rasgo no documentado en ficha'
}

function buildEmojis(sp: CatalogSpecies): string {
  const risk = toRiskLabel(sp.risk_label)
  const riskE =
    risk === 'deadly'
      ? '☠️'
      : risk === 'poisonous' || risk === 'toxic'
        ? '⚠️'
        : '🍄'
  const cats = ((sp as { categories?: string[] }).categories || []).join(' ').toLowerCase()
  const habitat =
    cats.includes('pinar') || cats.includes('conifer')
      ? '🌲'
      : cats.includes('prado') || cats.includes('meadow')
        ? '🌿'
        : cats.includes('haya') || cats.includes('roble') || cats.includes('bosque')
          ? '🌳'
          : '🏞️'
  const season = seasonLabel(sp).toLowerCase()
  const se =
    season.includes('oto') || season.includes('autumn')
      ? '🍂'
      : season.includes('prima') || season.includes('spring')
        ? '🌸'
        : season.includes('veran') || season.includes('summer')
          ? '☀️'
          : season.includes('invier') || season.includes('winter')
            ? '❄️'
            : '📅'
  return `${riskE}${habitat}${se}🔬`
}

export function toSetadleSpecies(sp: CatalogSpecies): SetadleSpecies {
  const vern = (sp.common_names && sp.common_names[0]) || sp.taxon
  const genus = sp.taxon.trim().split(/\s+/)[0] || '—'
  const descMap = (sp as { description?: Record<string, string> | string }).description
  let description = ''
  if (typeof descMap === 'string') description = descMap
  else if (descMap && typeof descMap === 'object') {
    description = String(descMap.es || descMap.en || '')
  }
  const tagline =
    String((sp as { tagline?: string | Record<string, string> }).tagline || '') ||
    description.slice(0, 140) ||
    `${vern} · ${sp.family || genus}`

  return {
    taxon: sp.taxon,
    slug: sp.slug,
    common: vern,
    family: sp.family || '—',
    genus,
    risk: toRiskLabel(sp.risk_label),
    edibility: String((sp as { edibility_code?: string }).edibility_code || 'desconocido'),
    iberian: String((sp as { iberian_relevance?: string }).iberian_relevance || '—'),
    season: seasonLabel(sp),
    tagline: typeof tagline === 'object' ? JSON.stringify(tagline) : tagline,
    description: description || tagline,
    trait: firstTrait(sp),
    emojis: buildEmojis(sp),
    risk_raw: sp.risk_label || 'unknown',
  }
}

export async function ensureSetadlePool(): Promise<SetadleSpecies[]> {
  await loadSpeciesCatalog()
  return buildSetadlePool()
}

export function buildSetadlePool(): SetadleSpecies[] {
  const list = speciesCatalog
    .filter((s) => s.taxon && s.slug && s.family)
    .map(toSetadleSpecies)
  // Prefer species with Spanish common names for playability
  const withCommon = list.filter((s) => s.common && fold(s.common) !== fold(s.taxon))
  return (withCommon.length >= 40 ? withCommon : list).slice()
}

export function pickDailySecret(pool: SetadleSpecies[], mode: SetadleMode, day = dayKey()): SetadleSpecies {
  if (pool.length === 0) throw new Error('empty setadle pool')
  const h = hashSeed(`setadle|${day}|${mode}|v1`)
  return pool[h % pool.length]
}

export function pickUnlimitedSecret(pool: SetadleSpecies[], excludeTaxon?: string): SetadleSpecies {
  const filtered = excludeTaxon
    ? pool.filter((p) => p.taxon !== excludeTaxon)
    : pool
  const list = filtered.length ? filtered : pool
  return list[Math.floor(Math.random() * list.length)]
}

function riskPartial(a: RiskLabel, b: RiskLabel): boolean {
  if (a === b) return false
  const ia = RISK_ORDER.indexOf(a)
  const ib = RISK_ORDER.indexOf(b)
  if (ia < 0 || ib < 0) return false
  return Math.abs(ia - ib) === 1
}

function seasonPartial(a: string, b: string): boolean {
  if (!a || !b || a === '—' || b === '—') return false
  const ta = fold(a).split(/[^a-z]+/).filter(Boolean)
  const tb = new Set(fold(b).split(/[^a-z]+/).filter(Boolean))
  return ta.some((t) => t.length > 3 && tb.has(t))
}

export function compareClassic(guess: SetadleSpecies, secret: SetadleSpecies): ClassicGuessRow {
  const cell = (key: AttrKey, gVal: string, sVal: string, partial?: boolean): ClassicGuessRow['cells'][0] => {
    let tone: CellTone = 'wrong'
    if (fold(gVal) === fold(sVal) && gVal !== '—') tone = 'correct'
    else if (partial) tone = 'partial'
    return { key, label: ATTR_LABELS[key], value: gVal, tone }
  }

  const cells = [
    cell('family', guess.family, secret.family),
    cell('genus', guess.genus, secret.genus),
    cell(
      'risk',
      guess.risk,
      secret.risk,
      riskPartial(guess.risk, secret.risk),
    ),
    cell('edibility', guess.edibility, secret.edibility),
    cell(
      'iberian',
      guess.iberian,
      secret.iberian,
      fold(guess.iberian).includes(fold(secret.iberian).slice(0, 4)) &&
        guess.iberian !== '—' &&
        secret.iberian !== '—',
    ),
    cell('season', guess.season, secret.season, seasonPartial(guess.season, secret.season)),
  ]

  return {
    taxon: guess.taxon,
    slug: guess.slug,
    common: guess.common,
    cells,
    won: fold(guess.taxon) === fold(secret.taxon),
  }
}

export function resolveGuess(pool: SetadleSpecies[], query: string): SetadleSpecies | null {
  const q = query.trim()
  if (!q) return null
  const qf = fold(q)
  const exact = pool.find((p) => fold(p.taxon) === qf || fold(p.common) === qf)
  if (exact) return exact
  const starts = pool.filter(
    (p) => fold(p.common).startsWith(qf) || fold(p.taxon).startsWith(qf),
  )
  if (starts[0]) return starts[0]
  const inc = pool.find(
    (p) => fold(p.common).includes(qf) || fold(p.taxon).includes(qf),
  )
  return inc || null
}

export function typeaheadPool(pool: SetadleSpecies[], query: string, limit = 8): SetadleSpecies[] {
  const q = fold(query.trim())
  if (q.length < 1) return []
  const scored = pool
    .map((p) => {
      const c = fold(p.common)
      const t = fold(p.taxon)
      let s = 0
      if (c === q || t === q) s = 100
      else if (c.startsWith(q) || t.startsWith(q)) s = 80
      else if (c.includes(q) || t.includes(q)) s = 40
      return { p, s }
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.common.localeCompare(b.p.common))
  return scored.slice(0, limit).map((x) => x.p)
}

/** Photo zoom: higher = more zoomed in (harder). Starts high, decreases. */
export function photoZoomForGuess(guessCount: number): number {
  // 2.8 → 1.0
  return Math.max(1, 2.8 - guessCount * 0.28)
}

export function storageWinKey(mode: SetadleMode, day = dayKey()): string {
  return `setadle_win_${mode}_${day}`
}

export function readDailyWin(mode: SetadleMode): { taxon: string; guesses: number } | null {
  try {
    const raw = localStorage.getItem(storageWinKey(mode))
    if (!raw) return null
    return JSON.parse(raw) as { taxon: string; guesses: number }
  } catch {
    return null
  }
}

export function writeDailyWin(mode: SetadleMode, taxon: string, guesses: number): void {
  try {
    localStorage.setItem(
      storageWinKey(mode),
      JSON.stringify({ taxon, guesses, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function todayKey(): string {
  return dayKey()
}

export { ATTR_LABELS }
