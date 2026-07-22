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

export type QuizMode = 'name' | 'photo' | 'food'

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
    color: 'green',
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
