import { describe, expect, it } from 'vitest'
import {
  BADGE_DEFS,
  dayKey,
  getStudyBadges,
  listEarnedBadges,
  liveStreak,
  recordStudyActivity,
  type StudyActivity,
} from './studyBadges'

function memStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

describe('study badges (Seek-style educational)', () => {
  it('records quiz and awards first_quiz', () => {
    const storage = memStorage()
    const r = recordStudyActivity('quiz', {
      storage,
      date: new Date(2026, 6, 1),
    })
    expect(r.stats.quizSessions).toBe(1)
    expect(r.streak.current).toBe(1)
    expect(r.newlyEarned).toContain('first_quiz')
  })

  it('builds consecutive streak across days', () => {
    const storage = memStorage()
    recordStudyActivity('quiz', { storage, date: new Date(2026, 6, 1) })
    recordStudyActivity('setadle', {
      storage,
      date: new Date(2026, 6, 2),
      won: true,
    })
    const r = recordStudyActivity('quiz', {
      storage,
      date: new Date(2026, 6, 3),
    })
    expect(r.streak.current).toBe(3)
    expect(listEarnedBadges(storage)).toContain('streak_3')
  })

  it('does not double-count same civil day for streak', () => {
    const storage = memStorage()
    const d = new Date(2026, 6, 10)
    recordStudyActivity('quiz', { storage, date: d })
    const r2 = recordStudyActivity('quiz', { storage, date: d })
    expect(r2.streak.current).toBe(1)
    expect(r2.stats.quizSessions).toBe(2)
  })

  it('badge catalog has no edible/consumption language', () => {
    const blob = BADGE_DEFS.map((b) =>
      `${b.titleEs} ${b.titleEn} ${b.blurbEs} ${b.blurbEn}`,
    )
      .join(' ')
      .toLowerCase()
    expect(blob).not.toMatch(/edible|comestible|safe to eat|permiso de consumo/)
  })

  it('getStudyBadges marks earned correctly', () => {
    const storage = memStorage()
    for (let i = 0; i < 5; i++) {
      recordStudyActivity('quiz' as StudyActivity, {
        storage,
        date: new Date(2026, 0, 1 + i),
      })
    }
    const badges = getStudyBadges(storage, 'es')
    expect(badges.find((b) => b.id === 'quiz_5')?.earned).toBe(true)
    expect(badges.find((b) => b.id === 'first_quiz')?.earned).toBe(true)
  })

  it('liveStreak breaks after gap day', () => {
    const storage = memStorage()
    recordStudyActivity('quiz', { storage, date: new Date(2026, 0, 1) })
    const streak = recordStudyActivity('quiz', {
      storage,
      date: new Date(2026, 0, 5),
    }).streak
    expect(liveStreak(streak, new Date(2026, 0, 5))).toBe(1)
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
