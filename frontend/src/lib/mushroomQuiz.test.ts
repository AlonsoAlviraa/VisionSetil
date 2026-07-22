import { describe, expect, it } from 'vitest'
import {
  QUIZ_OPTION_COUNT,
  QUIZ_SECONDS,
  buildFoodRound,
  buildNameRound,
  buildPhotoRound,
  buildQuizPool,
  nextScore,
  scoreAnswer,
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
