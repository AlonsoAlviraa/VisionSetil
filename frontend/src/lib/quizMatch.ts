/**
 * Pure 10-round match state for Reto (no React).
 * Unit-tested independently of the page UI.
 */
import type { RoundResult } from './mushroomQuiz'

export const MATCH_ROUNDS = 10

export type MatchPhase = 'idle' | 'playing' | 'round_reveal' | 'finished'

export type MatchState = {
  /** 0-based index of the current/active round while playing */
  roundIndex: number
  /** Number of rounds fully resolved (0..MATCH_ROUNDS) */
  resolvedCount: number
  score: number
  streak: number
  bestStreak: number
  phase: MatchPhase
  history: RoundResult[]
}

export function createMatchState(): MatchState {
  return {
    roundIndex: 0,
    resolvedCount: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    phase: 'idle',
    history: [],
  }
}

export function startMatch(_state: MatchState = createMatchState()): MatchState {
  return {
    ...createMatchState(),
    phase: 'playing',
    roundIndex: 0,
  }
}

export function matchProgress(state: MatchState): {
  currentDisplay: number
  total: number
  remaining: number
  finished: boolean
} {
  const finished = state.phase === 'finished' || state.resolvedCount >= MATCH_ROUNDS
  return {
    currentDisplay: finished
      ? MATCH_ROUNDS
      : Math.min(state.roundIndex + 1, MATCH_ROUNDS),
    total: MATCH_ROUNDS,
    remaining: Math.max(0, MATCH_ROUNDS - state.resolvedCount),
    finished,
  }
}

export function isMatchFinished(state: MatchState): boolean {
  return state.phase === 'finished'
}

/** True after the Nth result has been recorded (may still be on reveal UI). */
export function isMatchComplete(state: MatchState): boolean {
  return state.resolvedCount >= MATCH_ROUNDS
}

/**
 * Apply a completed round result. Advances resolvedCount and score.
 * After MATCH_ROUNDS results, phase becomes finished.
 */
export function applyMatchRoundResult(
  state: MatchState,
  result: RoundResult,
  nextScore: number,
): MatchState {
  if (state.phase === 'finished' || state.resolvedCount >= MATCH_ROUNDS) {
    return state
  }
  const streak = result.correct ? state.streak + 1 : 0
  const resolvedCount = state.resolvedCount + 1
  const history = [...state.history, result]
  const bestStreak = Math.max(state.bestStreak, streak)
  // Always land on round_reveal so the last answer can show feedback before end summary.
  return {
    roundIndex: Math.min(resolvedCount, MATCH_ROUNDS - 1),
    resolvedCount,
    score: nextScore,
    streak,
    bestStreak,
    phase: 'round_reveal',
    history,
  }
}

/** Advance from round_reveal → next playing round, or finished after last reveal. */
export function continueMatch(state: MatchState): MatchState {
  if (state.resolvedCount >= MATCH_ROUNDS) {
    return { ...state, phase: 'finished' }
  }
  return {
    ...state,
    phase: 'playing',
    roundIndex: state.resolvedCount,
  }
}

export function matchSummary(state: MatchState): {
  score: number
  resolved: number
  correctCount: number
  accuracy: number
  bestStreak: number
} {
  const correctCount = state.history.filter((h) => h.correct).length
  const resolved = state.history.length
  return {
    score: state.score,
    resolved,
    correctCount,
    accuracy: resolved === 0 ? 0 : correctCount / resolved,
    bestStreak: state.bestStreak,
  }
}
