/**
 * Educational mushroom quiz — Preguntados-style.
 * Food-quality mode uses ONLY documented records from foodQuality registry
 * (mushroomDatabase + poisonousSpecies). Never invents "comestible".
 * Season mode uses educational phenology only — never a harvest calendar.
 */
import { getSpeciesByTaxon, loadSpeciesCatalog, speciesCatalog } from '../data/speciesCatalog'

/** Optional hydrate for slug resolution (code-split catalog). */
export async function ensureQuizCatalog() {
  return loadSpeciesCatalog()
}
import {
  FOOD_CLASS_META,
  listDocumentedFoodQuality,
  type FoodClass,
  type FoodQualityRecord,
} from './foodQuality'
import { CLASSIC_LOOKALIKE_PAIRS } from './lookalikeStudio'
import { findDiagnosticPair } from './diagnosticViews'
import type { CanonicalView } from './multiViewSlots'
import { parseSeasonTokens } from './phenology'
import { SEASON_META, type SeasonId } from './seasonRadar'
import { resolveSpeciesMeta } from './speciesMeta'

export const QUIZ_SECONDS = 30
export const QUIZ_OPTION_COUNT = 4
/** Daily challenge: fewer rounds so a full session is comfortably <3 min. */
export const DAILY_QUIZ_SECONDS = 20
export const DAILY_MATCH_ROUNDS = 6
export const QUIZ_BEST_KEY = 'visionsetil_quiz_best'
export const QUIZ_DAILY_BEST_KEY = 'visionsetil_quiz_daily_best'

export type QuizMode = 'name' | 'photo' | 'food' | 'lookalike' | 'season'
export type QuizPlayKind = 'daily' | 'free'

/** Food-quality buckets for the game (A–D). No "sin datos". */
export type QuizFoodBucket = FoodClass

export const QUIZ_FOOD_OPTIONS: Array<{
  id: QuizFoodBucket
  label: string
  hint: string
  letter: string
  color: string
}> = [
  {
    id: 'comestible',
    label: FOOD_CLASS_META.comestible.label,
    hint: FOOD_CLASS_META.comestible.hint,
    letter: 'A',
    // D16: educational teal tint class — not food-safe green
    color: 'teal',
  },
  {
    id: 'no_comestible',
    label: FOOD_CLASS_META.no_comestible.label,
    hint: FOOD_CLASS_META.no_comestible.hint,
    letter: 'B',
    color: 'slate',
  },
  {
    id: 'toxica',
    label: FOOD_CLASS_META.toxica.label,
    hint: FOOD_CLASS_META.toxica.hint,
    letter: 'C',
    color: 'orange',
  },
  {
    id: 'mortal',
    label: FOOD_CLASS_META.mortal.label,
    hint: FOOD_CLASS_META.mortal.hint,
    letter: 'D',
    color: 'red',
  },
]

export type QuizSpecies = {
  taxon: string
  slug: string
  common: string
  /** Documented food class — always set for quiz pool entries */
  food_class: FoodClass
  food_label: string
  sources: string[]
  /** For image risk tint */
  risk_label: string
}

export type NameRound = {
  mode: 'name'
  prompt: string
  subject: QuizSpecies
  options: QuizSpecies[]
  correctId: string
}

export type PhotoRound = {
  mode: 'photo'
  prompt: string
  subject: QuizSpecies
  options: QuizSpecies[]
  correctId: string
}

export type FoodRound = {
  mode: 'food'
  prompt: string
  subject: QuizSpecies
  options: typeof QUIZ_FOOD_OPTIONS
  correctId: QuizFoodBucket
  sourceNote: string
}

/** Educational classic-pair round — never invents lookalikes; no ML. */
export type LookalikeRound = {
  mode: 'lookalike'
  prompt: string
  subject: QuizSpecies
  mate: QuizSpecies
  why: string
  /** Pair-specific multi-view slots that discriminate (from diagnostic map). */
  critical_views: CanonicalView[]
  /** Diagnostic map pair id when known. */
  pair_id: string | null
  options: QuizSpecies[]
  correctId: string
}

/** Educational season options (phenology study — never harvest permission). */
export const QUIZ_SEASON_OPTIONS: Array<{
  id: SeasonId
  label: string
  hint: string
  letter: string
  color: string
}> = [
  {
    id: 'primavera',
    label: SEASON_META.primavera.labelEs,
    hint: SEASON_META.primavera.months + ' · solo educativo',
    letter: 'A',
    color: 'teal',
  },
  {
    id: 'verano',
    label: SEASON_META.verano.labelEs,
    hint: SEASON_META.verano.months + ' · solo educativo',
    letter: 'B',
    color: 'slate',
  },
  {
    id: 'otono',
    label: SEASON_META.otono.labelEs,
    hint: SEASON_META.otono.months + ' · no es recolección',
    letter: 'C',
    color: 'orange',
  },
  {
    id: 'invierno',
    label: SEASON_META.invierno.labelEs,
    hint: SEASON_META.invierno.months + ' · solo educativo',
    letter: 'D',
    color: 'red',
  },
]

/** Seek-style phenology challenge — window típica, never harvest calendar. */
export type SeasonRound = {
  mode: 'season'
  prompt: string
  subject: QuizSpecies
  options: typeof QUIZ_SEASON_OPTIONS
  /** Primary answer (first active season). */
  correctId: SeasonId
  /** All seasons documented for the taxon (any accepted as correct). */
  acceptedIds: SeasonId[]
  seasonNote: string
}

export type QuizRound = NameRound | PhotoRound | FoodRound | LookalikeRound | SeasonRound

export type RoundResult = {
  correct: boolean
  timedOut: boolean
  secondsLeft: number
  correctLabel: string
  pickedLabel: string | null
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Local calendar day key YYYY-MM-DD (deterministic per device timezone). */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Integer seed for the daily challenge (same civil day → same seed).
 * Stable across reloads; not crypto — educational shuffle only.
 */
export function dailySeed(date: Date = new Date()): number {
  const key = dayKey(date)
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // mix product salt so seeds differ from raw date hashes elsewhere
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

/** Mulberry32 PRNG — deterministic [0,1) sequence from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngFromDaily(date: Date = new Date()): () => number {
  return mulberry32(dailySeed(date))
}

/** Rotate modes for daily rounds: food → name → photo → lookalike → season. */
export function dailyModeForRound(roundIndex: number): QuizMode {
  const modes: QuizMode[] = ['food', 'name', 'photo', 'lookalike', 'season']
  return modes[roundIndex % modes.length]
}

function taxonToQuizSpecies(taxon: string): QuizSpecies | null {
  const cat = getSpeciesByTaxon(taxon)
  if (!cat) return null
  const food = (cat.food_class as FoodClass | null | undefined) || null
  // Lookalike subjects need catalog resolution; food_class may be sparse.
  // Use documented food when present, else educational unknown bucket for pool typing.
  const fc: FoodClass = food || 'no_comestible'
  return {
    taxon: cat.taxon,
    slug: cat.slug,
    common: cat.common_names?.[0] || cat.taxon,
    food_class: fc,
    food_label: cat.food_label || fc,
    sources: ['species_catalog_v2 lookalikes'],
    risk_label: cat.risk_label || 'dangerous_or_unknown',
  }
}

/** Classic pairs fully resolvable in catalog (both sides). */
export function listResolvableLookalikePairs(): Array<{
  a: QuizSpecies
  b: QuizSpecies
  why: string
  id: string
}> {
  const out: Array<{ a: QuizSpecies; b: QuizSpecies; why: string; id: string }> = []
  for (const p of CLASSIC_LOOKALIKE_PAIRS) {
    const a = taxonToQuizSpecies(p.taxa[0])
    const b = taxonToQuizSpecies(p.taxa[1])
    if (!a || !b) continue
    out.push({ a, b, why: p.why, id: p.id })
  }
  // Also SSOT catalog lookalikes for food-pool taxa
  for (const s of speciesCatalog) {
    for (const mate of s.lookalikes || []) {
      const a = taxonToQuizSpecies(s.taxon)
      const b = taxonToQuizSpecies(mate)
      if (!a || !b) continue
      const id = `ssot-${a.slug}-${b.slug}`
      if (out.some((x) => x.id === id || (x.a.taxon === a.taxon && x.b.taxon === b.taxon))) continue
      out.push({ a, b, why: 'Par de confusión documentado en catálogo (educativo)', id })
    }
  }
  return out
}

/**
 * Build a full daily challenge: fixed number of rounds from a day seed.
 * Same day + same pool → same subjects/options order (deterministic).
 */
export function buildDailyChallenge(
  pool: QuizSpecies[],
  date: Date = new Date(),
  rounds: number = DAILY_MATCH_ROUNDS,
): QuizRound[] {
  if (pool.length < QUIZ_OPTION_COUNT) throw new Error('Quiz pool too small')
  const rng = rngFromDaily(date)
  const out: QuizRound[] = []
  for (let i = 0; i < rounds; i++) {
    out.push(buildRound(dailyModeForRound(i), pool, rng))
  }
  return out
}

export type DailyBestRecord = {
  day: string
  score: number
}

export function readDailyBest(
  storage: { getItem(k: string): string | null } = localStorage,
): DailyBestRecord {
  try {
    const raw = storage.getItem(QUIZ_DAILY_BEST_KEY)
    if (!raw) return { day: '', score: 0 }
    const parsed = JSON.parse(raw) as DailyBestRecord
    if (!parsed || typeof parsed.day !== 'string' || typeof parsed.score !== 'number') {
      return { day: '', score: 0 }
    }
    return { day: parsed.day, score: Number.isFinite(parsed.score) ? parsed.score : 0 }
  } catch {
    return { day: '', score: 0 }
  }
}

/** Persist best score for a civil day (only upgrades same-day record). */
export function writeDailyBest(
  day: string,
  score: number,
  storage: {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
  } = localStorage,
): DailyBestRecord {
  const prev = readDailyBest(storage)
  const nextScore = prev.day === day ? Math.max(prev.score, score) : score
  const next = { day, score: nextScore }
  try {
    storage.setItem(QUIZ_DAILY_BEST_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function readAllTimeBest(
  storage: { getItem(k: string): string | null } = localStorage,
): number {
  try {
    const n = Number(storage.getItem(QUIZ_BEST_KEY) || '0')
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function writeAllTimeBest(
  score: number,
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } = localStorage,
): number {
  const prev = readAllTimeBest(storage)
  const next = Math.max(prev, score)
  try {
    storage.setItem(QUIZ_BEST_KEY, String(next))
  } catch {
    /* quota */
  }
  return next
}

function slugify(taxon: string): string {
  return taxon
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function foodClassToRiskTint(c: FoodClass): string {
  if (c === 'mortal') return 'deadly'
  if (c === 'toxica') return 'toxic'
  if (c === 'no_comestible') return 'unknown_or_risky'
  return 'unknown_or_risky'
}

export function qualityRecordToQuizSpecies(r: FoodQualityRecord): QuizSpecies {
  const cat = getSpeciesByTaxon(r.taxon)
  return {
    taxon: r.taxon,
    slug: cat?.slug || slugify(r.taxon),
    common: r.common || cat?.common_names?.[0] || r.taxon,
    food_class: r.food_class,
    food_label: r.label,
    sources: r.sources,
    risk_label: foodClassToRiskTint(r.food_class),
  }
}

/**
 * Quiz pool = only taxa with documented food quality.
 * Never includes invented or "sin datos" species.
 */
export function buildQuizPool(): QuizSpecies[] {
  const docs = listDocumentedFoodQuality()
  const mapped = docs.map(qualityRecordToQuizSpecies)
  // Prefer entries with a local common name distinct from latin
  const withCommon = mapped.filter((s) => s.common.toLowerCase() !== s.taxon.toLowerCase())
  return withCommon.length >= 12 ? withCommon : mapped
}

function pickDistinct(
  pool: QuizSpecies[],
  n: number,
  exclude: Set<string>,
  rng: () => number,
): QuizSpecies[] {
  const candidates = shuffle(
    pool.filter((s) => !exclude.has(s.taxon)),
    rng,
  )
  return candidates.slice(0, n)
}

/** Balanced subject: try not to always pick the same class. */
function pickSubject(pool: QuizSpecies[], rng: () => number): QuizSpecies {
  const byClass = new Map<FoodClass, QuizSpecies[]>()
  for (const s of pool) {
    const arr = byClass.get(s.food_class) || []
    arr.push(s)
    byClass.set(s.food_class, arr)
  }
  const classes = [...byClass.keys()]
  const cls = classes[Math.floor(rng() * classes.length)]
  const bucket = byClass.get(cls)!
  return bucket[Math.floor(rng() * bucket.length)]
}

export function buildNameRound(pool: QuizSpecies[], rng: () => number = Math.random): NameRound {
  if (pool.length < QUIZ_OPTION_COUNT) throw new Error('Quiz pool too small')
  const subject = pickSubject(pool, rng)
  const distractors = pickDistinct(pool, QUIZ_OPTION_COUNT - 1, new Set([subject.taxon]), rng)
  const options = shuffle([subject, ...distractors], rng)
  return {
    mode: 'name',
    prompt: '¿Cómo se llama esta seta?',
    subject,
    options,
    correctId: subject.taxon,
  }
}

export function buildPhotoRound(pool: QuizSpecies[], rng: () => number = Math.random): PhotoRound {
  if (pool.length < QUIZ_OPTION_COUNT) throw new Error('Quiz pool too small')
  const subject = pickSubject(pool, rng)
  const distractors = pickDistinct(pool, QUIZ_OPTION_COUNT - 1, new Set([subject.taxon]), rng)
  const options = shuffle([subject, ...distractors], rng)
  return {
    mode: 'photo',
    prompt: `¿Cuál es «${subject.common}»?`,
    subject,
    options,
    correctId: subject.taxon,
  }
}

export function buildFoodRound(pool: QuizSpecies[], rng: () => number = Math.random): FoodRound {
  if (pool.length < QUIZ_OPTION_COUNT) throw new Error('Quiz pool too small')
  const subject = pickSubject(pool, rng)
  return {
    mode: 'food',
    prompt: '¿Qué calidad alimenticia documentada tiene?',
    subject,
    options: QUIZ_FOOD_OPTIONS,
    correctId: subject.food_class,
    sourceNote: subject.sources.join(' · '),
  }
}

export function buildLookalikeRound(
  pool: QuizSpecies[],
  rng: () => number = Math.random,
): LookalikeRound {
  if (pool.length < QUIZ_OPTION_COUNT) throw new Error('Quiz pool too small')
  const pairs = listResolvableLookalikePairs()
  if (pairs.length === 0) {
    // Fail closed to photo mode if no curated pairs (should not happen with SSOT)
    const photo = buildPhotoRound(pool, rng)
    return {
      mode: 'lookalike',
      prompt: 'Par lookalike no disponible — modo foto educativo',
      subject: photo.subject,
      mate: photo.subject,
      why: 'Sin pares curados en catálogo',
      critical_views: [],
      pair_id: null,
      options: photo.options,
      correctId: photo.correctId,
    }
  }
  const pair = pairs[Math.floor(rng() * pairs.length)]
  // 50%: show A ask for B, or reverse
  const flip = rng() < 0.5
  const subject = flip ? pair.b : pair.a
  const mate = flip ? pair.a : pair.b
  const distractors = pickDistinct(pool, QUIZ_OPTION_COUNT - 1, new Set([subject.taxon, mate.taxon]), rng)
  // Ensure we have enough options even if pool overlaps mates
  while (distractors.length < QUIZ_OPTION_COUNT - 1) {
    const filler = pickSubject(pool, rng)
    if (
      filler.taxon !== subject.taxon &&
      filler.taxon !== mate.taxon &&
      !distractors.some((d) => d.taxon === filler.taxon)
    ) {
      distractors.push(filler)
    }
    if (distractors.length >= QUIZ_OPTION_COUNT - 1) break
  }
  const options = shuffle([mate, ...distractors.slice(0, QUIZ_OPTION_COUNT - 1)], rng)
  const diag = findDiagnosticPair(subject.taxon, mate.taxon)
  return {
    mode: 'lookalike',
    prompt: `«${subject.common}» se confunde con… (educación · no consumo)`,
    subject,
    mate,
    why: diag?.why || pair.why,
    critical_views: diag?.critical_views ?? [],
    pair_id: diag?.pair_id ?? pair.id ?? null,
    options,
    correctId: mate.taxon,
  }
}

/** Resolve educational season string for a quiz subject (catalog + meta). */
export function seasonLabelForQuizTaxon(taxon: string): string {
  const cat = getSpeciesByTaxon(taxon)
  const meta = resolveSpeciesMeta({
    taxon,
    description: cat?.description,
    season: cat?.season,
    common_names: cat?.common_names,
    family: cat?.family,
    risk_label: cat?.risk_label,
    food_class: cat?.food_class,
    documented_edibility: cat?.documented_edibility,
  })
  return meta.season || ''
}

/**
 * Seek-style season challenge: pick a typical fruiting season window.
 * Educational phenology only — never a harvest/collection calendar.
 */
export function buildSeasonRound(
  pool: QuizSpecies[],
  rng: () => number = Math.random,
): SeasonRound {
  if (pool.length < QUIZ_OPTION_COUNT) throw new Error('Quiz pool too small')
  let subject = pickSubject(pool, rng)
  let seasons = parseSeasonTokens(seasonLabelForQuizTaxon(subject.taxon))
  // Prefer subjects with a parseable educational season
  for (let i = 0; i < 12 && seasons.length === 0; i++) {
    subject = pickSubject(pool, rng)
    seasons = parseSeasonTokens(seasonLabelForQuizTaxon(subject.taxon))
  }
  if (seasons.length === 0) {
    // Fail closed to a generic otoño educational default for documented pool taxa
    seasons = ['otono']
  }
  const primary = seasons[Math.floor(rng() * seasons.length)]
  return {
    mode: 'season',
    prompt:
      '¿En qué temporada típica se observa? (ventana educativa · no es calendario de recolección)',
    subject,
    options: QUIZ_SEASON_OPTIONS,
    correctId: primary,
    acceptedIds: seasons,
    seasonNote: seasonLabelForQuizTaxon(subject.taxon) || SEASON_META[primary].labelEs,
  }
}

export function buildRound(
  mode: QuizMode,
  pool: QuizSpecies[],
  rng: () => number = Math.random,
): QuizRound {
  if (mode === 'name') return buildNameRound(pool, rng)
  if (mode === 'photo') return buildPhotoRound(pool, rng)
  if (mode === 'lookalike') return buildLookalikeRound(pool, rng)
  if (mode === 'season') return buildSeasonRound(pool, rng)
  return buildFoodRound(pool, rng)
}

export function scoreAnswer(
  round: QuizRound,
  pickedId: string | null,
  secondsLeft: number,
  timedOut = false,
): RoundResult {
  let correct = false
  if (!timedOut && pickedId != null) {
    if (round.mode === 'season') {
      correct = round.acceptedIds.includes(pickedId as SeasonId)
    } else {
      correct = pickedId === round.correctId
    }
  }
  let correctLabel = ''
  let pickedLabel: string | null = null

  if (round.mode === 'food') {
    correctLabel =
      QUIZ_FOOD_OPTIONS.find((o) => o.id === round.correctId)?.label || String(round.correctId)
    pickedLabel = pickedId
      ? QUIZ_FOOD_OPTIONS.find((o) => o.id === pickedId)?.label || pickedId
      : null
  } else if (round.mode === 'season') {
    correctLabel =
      QUIZ_SEASON_OPTIONS.find((o) => o.id === round.correctId)?.label || String(round.correctId)
    if (round.acceptedIds.length > 1) {
      correctLabel = round.acceptedIds
        .map((id) => QUIZ_SEASON_OPTIONS.find((o) => o.id === id)?.label || id)
        .join(' · ')
    }
    pickedLabel = pickedId
      ? QUIZ_SEASON_OPTIONS.find((o) => o.id === pickedId)?.label || pickedId
      : null
  } else {
    const opts = round.options
    correctLabel = opts.find((o) => o.taxon === round.correctId)?.common || round.correctId
    pickedLabel = pickedId ? opts.find((o) => o.taxon === pickedId)?.common || pickedId : null
  }

  return {
    correct,
    timedOut,
    secondsLeft: Math.max(0, secondsLeft),
    correctLabel,
    pickedLabel,
  }
}

export function nextScore(prev: number, result: RoundResult): number {
  if (!result.correct) return prev
  const speed = Math.max(1, Math.ceil(result.secondsLeft / 5))
  return prev + 10 + speed
}

// Back-compat aliases for tests that imported risk names
export const QUIZ_RISK_OPTIONS = QUIZ_FOOD_OPTIONS
export type QuizRiskBucket = QuizFoodBucket
