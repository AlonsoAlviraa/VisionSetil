import { describe, expect, it } from 'vitest'
import {
  DAILY_MATCH_ROUNDS,
  DAILY_QUIZ_SECONDS,
  QUIZ_OPTION_COUNT,
  QUIZ_SECONDS,
  buildDailyChallenge,
  buildFoodRound,
  buildNameRound,
  buildPhotoRound,
  buildQuizPool,
  dailyModeForRound,
  dailySeed,
  dayKey,
  mulberry32,
  nextScore,
  readDailyBest,
  scoreAnswer,
  writeDailyBest,
} from './mushroomQuiz'
import { foodQualityStats } from './foodQuality'

describe('mushroomQuiz with documented food quality', () => {
  const pool = buildQuizPool()

  it('pool only contains documented food classes (no sin datos)', () => {
    expect(pool.length).toBeGreaterThanOrEqual(12)
    for (const s of pool) {
      expect(['comestible', 'no_comestible', 'toxica', 'mortal']).toContain(s.food_class)
      expect(s.sources.length).toBeGreaterThan(0)
    }
    // Has real comestibles from DB
    expect(pool.some((s) => s.food_class === 'comestible')).toBe(true)
    expect(pool.some((s) => s.food_class === 'mortal')).toBe(true)
  })

  it('builds food rounds with Comestible option, not Sin datos', () => {
    const r = buildFoodRound(pool, () => 0.2)
    expect(r.mode).toBe('food')
    expect(r.options.map((o) => o.label)).toEqual([
      'Comestible',
      'No comestible',
      'Tóxica',
      'Mortal',
    ])
    expect(r.options.some((o) => /sin datos/i.test(o.label))).toBe(false)
    expect(r.sourceNote.length).toBeGreaterThan(5)
    expect(['comestible', 'no_comestible', 'toxica', 'mortal']).toContain(r.correctId)
  })

  it('builds name/photo rounds with 4 options', () => {
    const n = buildNameRound(pool, () => 0.1)
    const p = buildPhotoRound(pool, () => 0.15)
    expect(n.options).toHaveLength(QUIZ_OPTION_COUNT)
    expect(p.options).toHaveLength(QUIZ_OPTION_COUNT)
    expect(n.subject.taxon).toBe(n.correctId)
  })

  it('scores food answers', () => {
    const r = buildFoodRound(pool, () => 0.3)
    expect(scoreAnswer(r, r.correctId, 20, false).correct).toBe(true)
    expect(scoreAnswer(r, null, 0, true).timedOut).toBe(true)
    expect(QUIZ_SECONDS).toBe(30)
  })

  it('speed bonus', () => {
    const fast = nextScore(0, {
      correct: true,
      timedOut: false,
      secondsLeft: 25,
      correctLabel: 'x',
      pickedLabel: 'x',
    })
    const slow = nextScore(0, {
      correct: true,
      timedOut: false,
      secondsLeft: 2,
      correctLabel: 'x',
      pickedLabel: 'x',
    })
    expect(fast).toBeGreaterThan(slow)
  })

  it('stats expose mega-pass counts from real sources', () => {
    const s = foodQualityStats()
    expect(s.total_documented).toBeGreaterThan(100)
    expect(s.by_class.comestible + s.by_class.no_comestible + s.by_class.toxica + s.by_class.mortal).toBe(
      s.total_documented,
    )
  })
})

describe('daily challenge seed (D-11)', () => {
  const pool = buildQuizPool()

  it('dayKey and dailySeed are stable for the same civil day', () => {
    const a = new Date(2026, 6, 23, 9, 0, 0)
    const b = new Date(2026, 6, 23, 21, 30, 0)
    const c = new Date(2026, 6, 24, 9, 0, 0)
    expect(dayKey(a)).toBe('2026-07-23')
    expect(dayKey(a)).toBe(dayKey(b))
    expect(dailySeed(a)).toBe(dailySeed(b))
    expect(dailySeed(a)).not.toBe(dailySeed(c))
  })

  it('mulberry32 is deterministic', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const seq1 = [r1(), r1(), r1()]
    const seq2 = [r2(), r2(), r2()]
    expect(seq1).toEqual(seq2)
    expect(seq1[0]).toBeGreaterThanOrEqual(0)
    expect(seq1[0]).toBeLessThan(1)
  })

  it('buildDailyChallenge is deterministic for same day', () => {
    const day = new Date(2026, 6, 23, 12, 0, 0)
    const a = buildDailyChallenge(pool, day)
    const b = buildDailyChallenge(pool, day)
    expect(a).toHaveLength(DAILY_MATCH_ROUNDS)
    expect(DAILY_QUIZ_SECONDS).toBe(20)
    expect(a.map((r) => r.mode)).toEqual(
      Array.from({ length: DAILY_MATCH_ROUNDS }, (_, i) => dailyModeForRound(i)),
    )
    expect(a.map((r) => r.subject.taxon)).toEqual(b.map((r) => r.subject.taxon))
    expect(a.map((r) => r.correctId)).toEqual(b.map((r) => r.correctId))
    // food rounds only use documented labels
    for (const r of a) {
      if (r.mode === 'food') {
        expect(r.options.some((o) => /sin datos/i.test(o.label))).toBe(false)
      }
    }
  })

  it('daily best is per-day and only upgrades', () => {
    const store: Record<string, string> = {}
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
    }
    expect(readDailyBest(storage).score).toBe(0)
    writeDailyBest('2026-07-23', 40, storage)
    expect(readDailyBest(storage)).toEqual({ day: '2026-07-23', score: 40 })
    writeDailyBest('2026-07-23', 30, storage)
    expect(readDailyBest(storage).score).toBe(40)
    writeDailyBest('2026-07-23', 55, storage)
    expect(readDailyBest(storage).score).toBe(55)
    writeDailyBest('2026-07-24', 10, storage)
    expect(readDailyBest(storage)).toEqual({ day: '2026-07-24', score: 10 })
  })
})
