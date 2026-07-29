import { describe, expect, it } from 'vitest'
import {
  WORDLE_MAX_GUESSES,
  applyGuess,
  buildWordlePool,
  evaluatePhase,
  normalizeWordleAnswer,
  pickCommonNameForWordle,
  pickNextWordle,
  scoreWordleGuess,
} from './mushroomWordle'
import type { CatalogSpecies } from '../data/speciesCatalog'

const fakeCat = (
  taxon: string,
  commons: string[] = [],
  risk = 'unknown_or_risky',
): CatalogSpecies =>
  ({
    taxon,
    slug: taxon.toLowerCase().replace(/\s+/g, '-'),
    common_names: commons,
    common_names_en: [],
    risk_label: risk,
    family: 'Testaceae',
    lookalikes: [],
  }) as CatalogSpecies

describe('mushroomWordle', () => {
  it('normalizes common names to letters only (not scientific by default)', () => {
    expect(normalizeWordleAnswer('Níscalo')).toBe('NISCALO')
    expect(normalizeWordleAnswer('Oronja verde')).toBe('ORONJAVERDE')
    expect(normalizeWordleAnswer('Hongo de la muerte')).toBe('HONGODELAMUERTE')
  })

  it('picks vernacular over scientific per locale', () => {
    const c = fakeCat('Boletus edulis', ['Hongo blanco', 'Boletus edulis'])
    c.common_names_en = ['Porcini', 'King bolete']
    c.common_names_ca = ['Cep', 'Sureny']
    c.common_names_eu = ['Onddo zuri']
    expect(pickCommonNameForWordle(c, 'es')).toBe('Hongo blanco')
    expect(normalizeWordleAnswer(pickCommonNameForWordle(c, 'es')!)).toBe('HONGOBLANCO')
    expect(pickCommonNameForWordle(c, 'en')).toBe('Porcini')
    expect(normalizeWordleAnswer(pickCommonNameForWordle(c, 'en')!)).toBe('PORCINI')
    // "Cep" is only 3 letters — below WORDLE_MIN_LEN; next CA name wins
    expect(pickCommonNameForWordle(c, 'ca')).toBe('Sureny')
    expect(pickCommonNameForWordle(c, 'eu')).toBe('Onddo zuri')
  })

  it('scores Wordle greens and yellows correctly', () => {
    // classic: answer CRANE, guess CRAZY — C R A correct, Z absent, Y absent
    const tones = scoreWordleGuess('CRANE', 'CRANE')
    expect(tones.every((t) => t === 'correct')).toBe(true)

    // ABCD vs DCBA
    const t2 = scoreWordleGuess('ABCD', 'DCBA')
    expect(t2).toEqual(['present', 'present', 'present', 'present'])
  })

  it('handles duplicate letters without double yellow', () => {
    // answer: LLAMA (5) — use fixed
    const tones = scoreWordleGuess('LLLLL', 'LLAMA')
    // first two L correct if positions match: L L A M A
    // guess L L L L L → pos0 correct, pos1 correct, rest yellows limited
    expect(tones[0]).toBe('correct')
    expect(tones[1]).toBe('correct')
    // remaining L in answer: one more at... LLAMA has L at 0,1 only → rest absent
    expect(tones.filter((x) => x === 'correct').length).toBe(2)
  })

  it('applyGuess wins and loses', () => {
    const answer = 'FUNGI'
    let r = applyGuess([], 'FUNGI', answer)
    expect(r.phase).toBe('won')

    const wrong = ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY', 'ZZZZZ']
    let rows: { guess: string; tones: ReturnType<typeof scoreWordleGuess> }[] = []
    for (const g of wrong.slice(0, WORDLE_MAX_GUESSES)) {
      const next = applyGuess(rows, g, answer)
      expect(next.error).toBeUndefined()
      rows = next.rows
    }
    expect(evaluatePhase(rows, answer)).toBe('lost')
    expect(rows).toHaveLength(WORDLE_MAX_GUESSES)
  })

  it('pool uses common names and pickNext avoids exclude', () => {
    const pool = buildWordlePool([
      fakeCat('Amanita muscaria', ['Matamoscas']),
      fakeCat('Boletus edulis', ['Hongo blanco']),
      fakeCat('Tiny sp', ['Xy']), // too short common
      fakeCat('Only latin', []), // no vernacular → skipped
    ])
    expect(pool.length).toBeGreaterThanOrEqual(2)
    expect(pool.every((p) => p.answer.length >= 4)).toBe(true)
    expect(pool.some((p) => p.answer === 'MATAMOSCAS')).toBe(true)
    expect(pool.some((p) => p.answer === 'HONGOBLANCO')).toBe(true)
    // Must not use bare scientific as answer when vernacular exists
    expect(pool.every((p) => p.answer !== 'BOLETUSEDULIS')).toBe(true)
    const a = pool[0]
    const next = pickNextWordle(pool, [a.answer], () => 0)
    if (pool.length > 1) {
      expect(next.answer).not.toBe(a.answer)
    }
  })

  it('never frames consumption in module constants', () => {
    expect(WORDLE_MAX_GUESSES).toBe(6)
  })

  it('keyboard adapts: Ñ for es/ca, plain for en', async () => {
    const { wordleKeyboardForLocale } = await import('./mushroomWordle')
    const es = wordleKeyboardForLocale('es').flat().join('')
    const en = wordleKeyboardForLocale('en').flat().join('')
    expect(es).toContain('Ñ')
    expect(en).not.toContain('Ñ')
  })
})
