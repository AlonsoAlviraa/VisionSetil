/**
 * Educational study badges & streaks (Seek-inspired gamification).
 *
 * Rules:
 * - Games / study only (quiz + setadle + lookalike + encyclopedia) — never tied to
 *   identify "edible" outcomes or forage permission.
 * - Lookalike activity: `recordStudyActivity('lookalike')` from Lookalike Studio
 *   learning path step 3 (UX-06) — reuse this counter; do not invent parallel keys.
 * - No consumption language; badge titles are learning milestones.
 * - Local-only progress (privacy-first, no account required).
 */
export const STUDY_STREAK_KEY = 'visionsetil_study_streak_v1'
export const STUDY_STATS_KEY = 'visionsetil_study_stats_v1'

export type StudyActivity = 'quiz' | 'setadle' | 'lookalike' | 'encyclopedia'

export type StudyStreak = {
  /** Civil day keys YYYY-MM-DD that count as studied */
  days: string[]
  /** Current consecutive-day streak ending on lastDay (0 if broken) */
  current: number
  /** Best streak ever */
  best: number
  lastDay: string
}

export type StudyStats = {
  quizSessions: number
  setadleWins: number
  lookalikeCompares: number
  encyclopediaViews: number
  totalDays: number
}

export type StudyBadgeId =
  | 'first_quiz'
  | 'streak_3'
  | 'streak_7'
  | 'quiz_5'
  | 'setadle_3'
  | 'lookalike_curious'
  | 'encyclopedia_explorer'
  | 'week_scholar'

export type StudyBadge = {
  id: StudyBadgeId
  titleEs: string
  titleEn: string
  blurbEs: string
  blurbEn: string
  emoji: string
  earned: boolean
}

const EMPTY_STREAK: StudyStreak = { days: [], current: 0, best: 0, lastDay: '' }
const EMPTY_STATS: StudyStats = {
  quizSessions: 0,
  setadleWins: 0,
  lookalikeCompares: 0,
  encyclopediaViews: 0,
  totalDays: 0,
}

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function prevDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return dayKey(dt)
}

type StorageLike = {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export function readStudyStreak(storage: StorageLike = localStorage): StudyStreak {
  try {
    const raw = storage.getItem(STUDY_STREAK_KEY)
    if (!raw) return { ...EMPTY_STREAK }
    const p = JSON.parse(raw) as StudyStreak
    if (!p || !Array.isArray(p.days)) return { ...EMPTY_STREAK }
    return {
      days: p.days.filter((x) => typeof x === 'string').slice(-90),
      current: Number.isFinite(p.current) ? Math.max(0, p.current) : 0,
      best: Number.isFinite(p.best) ? Math.max(0, p.best) : 0,
      lastDay: typeof p.lastDay === 'string' ? p.lastDay : '',
    }
  } catch {
    return { ...EMPTY_STREAK }
  }
}

export function readStudyStats(storage: StorageLike = localStorage): StudyStats {
  try {
    const raw = storage.getItem(STUDY_STATS_KEY)
    if (!raw) return { ...EMPTY_STATS }
    const p = JSON.parse(raw) as Partial<StudyStats>
    return {
      quizSessions: Number(p.quizSessions) || 0,
      setadleWins: Number(p.setadleWins) || 0,
      lookalikeCompares: Number(p.lookalikeCompares) || 0,
      encyclopediaViews: Number(p.encyclopediaViews) || 0,
      totalDays: Number(p.totalDays) || 0,
    }
  } catch {
    return { ...EMPTY_STATS }
  }
}

function writeStreak(s: StudyStreak, storage: StorageLike) {
  try {
    storage.setItem(STUDY_STREAK_KEY, JSON.stringify(s))
  } catch {
    /* quota */
  }
}

function writeStats(s: StudyStats, storage: StorageLike) {
  try {
    storage.setItem(STUDY_STATS_KEY, JSON.stringify(s))
  } catch {
    /* quota */
  }
}

/**
 * Record a study activity. Updates streak (once per civil day) + counters.
 * Returns next streak + stats + newly earned badge ids.
 */
export function recordStudyActivity(
  activity: StudyActivity,
  opts?: { date?: Date; storage?: StorageLike; won?: boolean },
): { streak: StudyStreak; stats: StudyStats; newlyEarned: StudyBadgeId[] } {
  const storage = opts?.storage ?? localStorage
  const today = dayKey(opts?.date ?? new Date())
  const before = listEarnedBadges(storage)

  let streak = readStudyStreak(storage)
  let stats = readStudyStats(storage)

  // Counters
  if (activity === 'quiz') stats = { ...stats, quizSessions: stats.quizSessions + 1 }
  if (activity === 'setadle' && opts?.won !== false) {
    stats = { ...stats, setadleWins: stats.setadleWins + 1 }
  }
  if (activity === 'lookalike') {
    stats = { ...stats, lookalikeCompares: stats.lookalikeCompares + 1 }
  }
  if (activity === 'encyclopedia') {
    stats = { ...stats, encyclopediaViews: stats.encyclopediaViews + 1 }
  }

  // Streak once per day
  if (streak.lastDay !== today) {
    const days = streak.days.includes(today) ? streak.days : [...streak.days, today].slice(-90)
    let current = 1
    if (streak.lastDay && streak.lastDay === prevDayKey(today)) {
      current = streak.current + 1
    } else if (streak.lastDay === today) {
      current = streak.current
    }
    streak = {
      days,
      current,
      best: Math.max(streak.best, current),
      lastDay: today,
    }
    stats = { ...stats, totalDays: days.length }
  }

  writeStreak(streak, storage)
  writeStats(stats, storage)

  const after = listEarnedBadges(storage)
  const newlyEarned = after.filter((id) => !before.includes(id))
  return { streak, stats, newlyEarned }
}

/** Live streak if last activity was today or yesterday; else 0. */
export function liveStreak(
  streak: StudyStreak = readStudyStreak(),
  now: Date = new Date(),
): number {
  const today = dayKey(now)
  if (streak.lastDay === today) return streak.current
  if (streak.lastDay === prevDayKey(today)) return streak.current
  return 0
}

export function listEarnedBadges(storage: StorageLike = localStorage): StudyBadgeId[] {
  const streak = readStudyStreak(storage)
  const stats = readStudyStats(storage)
  const current = liveStreak(streak)
  const earned: StudyBadgeId[] = []
  if (stats.quizSessions >= 1) earned.push('first_quiz')
  if (current >= 3 || streak.best >= 3) earned.push('streak_3')
  if (current >= 7 || streak.best >= 7) earned.push('streak_7')
  if (stats.quizSessions >= 5) earned.push('quiz_5')
  if (stats.setadleWins >= 3) earned.push('setadle_3')
  if (stats.lookalikeCompares >= 3) earned.push('lookalike_curious')
  if (stats.encyclopediaViews >= 10) earned.push('encyclopedia_explorer')
  if (stats.totalDays >= 7) earned.push('week_scholar')
  return earned
}

export const BADGE_DEFS: Omit<StudyBadge, 'earned'>[] = [
  {
    id: 'first_quiz',
    titleEs: 'Primera partida',
    titleEn: 'First quiz',
    blurbEs: 'Completaste un reto de estudio.',
    blurbEn: 'You finished a study challenge.',
    emoji: '🎯',
  },
  {
    id: 'streak_3',
    titleEs: 'Racha 3 días',
    titleEn: '3-day streak',
    blurbEs: 'Tres días seguidos estudiando setas (educativo).',
    blurbEn: 'Three days in a row studying mushrooms (educational).',
    emoji: '🔥',
  },
  {
    id: 'streak_7',
    titleEs: 'Semana de estudio',
    titleEn: 'Study week',
    blurbEs: 'Siete días de racha — solo aprendizaje, no consumo.',
    blurbEn: 'Seven-day streak — learning only, never consumption.',
    emoji: '⭐',
  },
  {
    id: 'quiz_5',
    titleEs: 'Retista',
    titleEn: 'Quiz regular',
    blurbEs: 'Cinco sesiones de Reto micológico.',
    blurbEn: 'Five mycological quiz sessions.',
    emoji: '🧠',
  },
  {
    id: 'setadle_3',
    titleEs: 'Setadle x3',
    titleEn: 'Setadle x3',
    blurbEs: 'Tres aciertos en el diario Setadle.',
    blurbEn: 'Three Setadle daily wins.',
    emoji: '🧩',
  },
  {
    id: 'lookalike_curious',
    titleEs: 'Ojo a confusiones',
    titleEn: 'Lookalike curious',
    blurbEs: 'Comparaste lookalikes en el Studio.',
    blurbEn: 'You compared lookalikes in Studio.',
    emoji: '👁',
  },
  {
    id: 'encyclopedia_explorer',
    titleEs: 'Explorador',
    titleEn: 'Explorer',
    blurbEs: 'Visitaste 10 fichas de la enciclopedia.',
    blurbEn: 'Opened 10 encyclopedia species cards.',
    emoji: '📖',
  },
  {
    id: 'week_scholar',
    titleEs: 'Estudiante de campo',
    titleEn: 'Field student',
    blurbEs: 'Siete días distintos de estudio en total.',
    blurbEn: 'Seven distinct study days total.',
    emoji: '🏔',
  },
]

export function getStudyBadges(
  storage: StorageLike = localStorage,
  locale = 'es',
): StudyBadge[] {
  const earned = new Set(listEarnedBadges(storage))
  const en = locale.toLowerCase().startsWith('en')
  return BADGE_DEFS.map((b) => ({
    ...b,
    earned: earned.has(b.id),
    // keep full fields; UI picks locale
  })).map((b) => ({
    id: b.id,
    titleEs: b.titleEs,
    titleEn: b.titleEn,
    blurbEs: b.blurbEs,
    blurbEn: b.blurbEn,
    emoji: b.emoji,
    earned: b.earned,
    // convenience for render without extra map
    ...(en
      ? {}
      : {}),
  }))
}

export function badgeTitle(b: StudyBadge, locale = 'es'): string {
  return locale.toLowerCase().startsWith('en') ? b.titleEn : b.titleEs
}

export function badgeBlurb(b: StudyBadge, locale = 'es'): string {
  return locale.toLowerCase().startsWith('en') ? b.blurbEn : b.blurbEs
}
