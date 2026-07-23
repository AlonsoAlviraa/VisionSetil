/**
 * Educational mushroom quiz — Preguntados-style.
 * Food-quality mode uses ONLY documented records from foodQuality registry
 * (mushroomDatabase + poisonousSpecies). Never invents "comestible".
 */
import { getSpeciesByTaxon, loadSpeciesCatalog } from '../data/speciesCatalog'

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

export const QUIZ_SECONDS = 30
export const QUIZ_OPTION_COUNT = 4
/** Daily challenge: fewer rounds so a full session is comfortably <3 min. */
export const DAILY_QUIZ_SECONDS = 20
export const DAILY_MATCH_ROUNDS = 6
export const QUIZ_BEST_KEY = 'visionsetil_quiz_best'
export const QUIZ_DAILY_BEST_KEY = 'visionsetil_quiz_daily_best'

export type QuizMode = 'name' | 'photo' | 'food'
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

export type QuizRound = NameRound | PhotoRound | FoodRound

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

/** Rotate modes for daily rounds: food → name → photo (educational mix). */
export function dailyModeForRound(roundIndex: number): QuizMode {
  const modes: QuizMode[] = ['food', 'name', 'photo']
  return modes[roundIndex % modes.length]
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

export function buildRound(
  mode: QuizMode,
  pool: QuizSpecies[],
  rng: () => number = Math.random,
): QuizRound {
  if (mode === 'name') return buildNameRound(pool, rng)
  if (mode === 'photo') return buildPhotoRound(pool, rng)
  return buildFoodRound(pool, rng)
}

export function scoreAnswer(
  round: QuizRound,
  pickedId: string | null,
  secondsLeft: number,
  timedOut = false,
): RoundResult {
  const correct = !timedOut && pickedId != null && pickedId === round.correctId
  let correctLabel = ''
  let pickedLabel: string | null = null

  if (round.mode === 'food') {
    correctLabel =
      QUIZ_FOOD_OPTIONS.find((o) => o.id === round.correctId)?.label || String(round.correctId)
    pickedLabel = pickedId
      ? QUIZ_FOOD_OPTIONS.find((o) => o.id === pickedId)?.label || pickedId
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
