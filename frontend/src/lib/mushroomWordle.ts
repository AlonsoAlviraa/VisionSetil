/**
 * Mushroom Wordle — letter-guess game on **common / vernacular names** (not scientific).
 * After win or loss, callers auto-advance to the next puzzle.
 * Never consumption permission.
 */
import {
  commonsForLocale,
  loadSpeciesCatalog,
  localeLang,
  speciesCatalog,
  type CatalogSpecies,
} from '../data/speciesCatalog'
import { toRiskLabel } from './riskLabels'

export const WORDLE_MAX_GUESSES = 6
/** Prefer readable lengths for the grid (common names). */
export const WORDLE_MIN_LEN = 4
export const WORDLE_MAX_LEN = 16
export const WORDLE_NEXT_DELAY_MS = 2200

export type LetterTone = 'correct' | 'present' | 'absent' | 'empty' | 'tbd'

export type WordleSpecies = {
  taxon: string
  slug: string
  /** Letters only A–Z/Ñ, uppercase, no spaces — from common name */
  answer: string
  /** Display common name (with spaces/accents for reveal) */
  common: string
  risk_label: string
  family: string
}

export type WordleRow = {
  guess: string
  tones: LetterTone[]
}

export type WordlePhase = 'playing' | 'won' | 'lost'

/**
 * Strip accents/spaces/punctuation → A–Z uppercase for Wordle grid.
 * Keeps Ñ as N for simpler keyboard scoring, or maps Ñ→N.
 * "Níscalo" → "NISCALO" · "Oronja verde" → "ORONJAVERDE"
 */
export function normalizeWordleAnswer(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'N')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
}

export function isValidWordleGuess(guess: string, answerLen: number): boolean {
  const g = normalizeWordleAnswer(guess)
  return g.length === answerLen && /^[A-Z]+$/.test(g)
}

/**
 * Pick best vernacular for Wordle in the active UI language.
 * Order: locale commons (es/en/ca/eu) via commonsForLocale — no scientific names.
 */
export function pickCommonNameForWordle(
  c: CatalogSpecies,
  locale = 'es',
): string | null {
  const candidates = commonsForLocale(c, locale)
  const sci = normalizeWordleAnswer(c.taxon)
  const lang = localeLang(locale)

  for (const raw of candidates) {
    const n = String(raw || '').trim()
    if (!n) continue
    const norm = normalizeWordleAnswer(n)
    if (!norm || norm === sci) continue
    if (/^[A-Z][a-z]+ [a-z]+$/.test(n) && norm === sci) continue
    if (norm.length < WORDLE_MIN_LEN || norm.length > WORDLE_MAX_LEN) continue
    if (/^sin nombre/i.test(n) || /^unknown/i.test(n) || /^sense nom/i.test(n)) continue
    // For EN: refuse Spanish-looking only if we have EN list empty was already filtered
    if (lang === 'en' && /[áéíóúñü]/i.test(n) && !(c.common_names_en || []).length) {
      continue
    }
    return n
  }
  return null
}

/** On-screen keyboard rows per language (Ñ for ES/CA; no Ñ for EN). */
export function wordleKeyboardForLocale(locale = 'es'): string[][] {
  const lang = localeLang(locale)
  if (lang === 'en') {
    return [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
    ]
  }
  // es / ca / eu — keep Ñ; Basque uses Latin + common letters
  return [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
  ]
}

/**
 * Classic Wordle scoring (two-pass: greens first, then yellows with counts).
 */
export function scoreWordleGuess(guessRaw: string, answerRaw: string): LetterTone[] {
  const guess = normalizeWordleAnswer(guessRaw)
  const answer = normalizeWordleAnswer(answerRaw)
  const n = answer.length
  if (guess.length !== n) {
    return Array.from({ length: Math.max(guess.length, n) }, () => 'absent' as LetterTone)
  }
  const tones: LetterTone[] = Array.from({ length: n }, () => 'absent')
  const remaining: Record<string, number> = {}

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      tones[i] = 'correct'
    } else {
      remaining[answer[i]] = (remaining[answer[i]] || 0) + 1
    }
  }
  for (let i = 0; i < n; i++) {
    if (tones[i] === 'correct') continue
    const ch = guess[i]
    if (remaining[ch] > 0) {
      tones[i] = 'present'
      remaining[ch] -= 1
    } else {
      tones[i] = 'absent'
    }
  }
  return tones
}

export function buildKeyboardTones(rows: WordleRow[]): Record<string, LetterTone> {
  const rank: Record<LetterTone, number> = {
    correct: 3,
    present: 2,
    absent: 1,
    empty: 0,
    tbd: 0,
  }
  const out: Record<string, LetterTone> = {}
  for (const row of rows) {
    for (let i = 0; i < row.guess.length; i++) {
      const ch = row.guess[i]
      const t = row.tones[i]
      if (!out[ch] || rank[t] > rank[out[ch]]) out[ch] = t
    }
  }
  return out
}

export function catalogToWordleSpecies(
  c: CatalogSpecies,
  locale = 'es',
): WordleSpecies | null {
  const common = pickCommonNameForWordle(c, locale)
  if (!common) return null
  const answer = normalizeWordleAnswer(common)
  if (answer.length < WORDLE_MIN_LEN || answer.length > WORDLE_MAX_LEN) return null
  return {
    taxon: c.taxon,
    slug: c.slug,
    answer,
    common,
    risk_label: c.risk_label || 'dangerous_or_unknown',
    family: c.family || '',
  }
}

/** Pool of playable **common names** (length filter, deduped by answer letters). */
export function buildWordlePool(
  catalog: CatalogSpecies[] = speciesCatalog,
  locale = 'es',
): WordleSpecies[] {
  const out: WordleSpecies[] = []
  const seen = new Set<string>()
  for (const c of catalog) {
    const w = catalogToWordleSpecies(c, locale)
    if (!w || seen.has(w.answer)) continue
    seen.add(w.answer)
    out.push(w)
  }
  // Prefer shorter, friendlier names first for daily rotation diversity
  return out.sort((a, b) => a.answer.length - b.answer.length || a.common.localeCompare(b.common, 'es'))
}

export async function ensureWordlePool(locale = 'es'): Promise<WordleSpecies[]> {
  await loadSpeciesCatalog()
  return buildWordlePool(speciesCatalog, locale)
}

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Deterministic daily puzzle (seed includes locale so each language has its own day word). */
export function pickDailyWordle(
  pool: WordleSpecies[],
  date: Date = new Date(),
  locale = 'es',
): WordleSpecies {
  if (pool.length === 0) throw new Error('Wordle pool empty')
  const lang = localeLang(locale)
  // Align salt with dailyGames LoLdle board (`wordle`) so hub foto/mode hints match.
  const idx =
    hashSeed(`visionsetil|daily|${dayKey(date)}|wordle|${lang}|v1`) % pool.length
  return pool[idx]
}

/** Next unlimited secret — avoid recent answers. */
export function pickNextWordle(
  pool: WordleSpecies[],
  excludeAnswers: string[] = [],
  rng: () => number = Math.random,
): WordleSpecies {
  if (pool.length === 0) throw new Error('Wordle pool empty')
  const ex = new Set(excludeAnswers.map((a) => a.toUpperCase()))
  const cand = pool.filter((p) => !ex.has(p.answer))
  const list = cand.length > 0 ? cand : pool
  const i = Math.floor(rng() * list.length)
  return list[i]
}

export function evaluatePhase(
  rows: WordleRow[],
  answer: string,
  maxGuesses: number = WORDLE_MAX_GUESSES,
): WordlePhase {
  if (rows.some((r) => r.guess === answer)) return 'won'
  if (rows.length >= maxGuesses) return 'lost'
  return 'playing'
}

export function applyGuess(
  rows: WordleRow[],
  guessRaw: string,
  answer: string,
): { rows: WordleRow[]; phase: WordlePhase; error?: string } {
  const guess = normalizeWordleAnswer(guessRaw)
  if (!isValidWordleGuess(guess, answer.length)) {
    return {
      rows,
      phase: evaluatePhase(rows, answer),
      error: `length:${answer.length}`,
    }
  }
  if (rows.some((r) => r.guess === guess)) {
    return { rows, phase: evaluatePhase(rows, answer), error: 'duplicate' }
  }
  const next = [...rows, { guess, tones: scoreWordleGuess(guess, answer) }]
  return { rows: next, phase: evaluatePhase(next, answer) }
}

/** Default QWERTY rows (ES) — prefer wordleKeyboardForLocale(locale). */
export const WORDLE_KEYS = wordleKeyboardForLocale('es')

export function displayAnswerWithSpaces(taxon: string): string {
  return taxon
}

export function riskIsHigh(risk: string): boolean {
  const r = toRiskLabel(risk)
  return r === 'deadly' || r === 'poisonous' || r === 'toxic'
}
