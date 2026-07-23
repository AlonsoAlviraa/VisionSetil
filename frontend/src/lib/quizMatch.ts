/**
 * Pure N-round match state for Reto (no React).
 * Unit-tested independently of the page UI.
 * D-11: totalRounds configurable (daily = 6, free = 10).
 */
import type { RoundResult } from './mushroomQuiz'

export const MATCH_ROUNDS = 10

export type MatchPhase = 'idle' | 'playing' | 'round_reveal' | 'finished'

export type MatchState = {
  /** 0-based index of the current/active round while playing */
  roundIndex: number
  /** Number of rounds fully resolved (0..totalRounds) */
  resolvedCount: number
  score: number
  streak: number
  bestStreak: number
  phase: MatchPhase
  history: RoundResult[]
  /** Total rounds in this match (D-11 daily uses fewer). */
  totalRounds: number
}

export function createMatchState(totalRounds: number = MATCH_ROUNDS): MatchState {
  const n = Math.max(1, Math.floor(totalRounds))
  return {
    roundIndex: 0,
    resolvedCount: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    phase: 'idle',
    history: [],
    totalRounds: n,
  }
}

export function startMatch(
  _state: MatchState = createMatchState(),
  totalRounds?: number,
): MatchState {
  const n =
    totalRounds != null
      ? Math.max(1, Math.floor(totalRounds))
      : _state.totalRounds || MATCH_ROUNDS
  return {
    ...createMatchState(n),
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
  const total = state.totalRounds || MATCH_ROUNDS
  const finished = state.phase === 'finished' || state.resolvedCount >= total
  return {
    currentDisplay: finished
      ? total
      : Math.min(state.roundIndex + 1, total),
    total,
    remaining: Math.max(0, total - state.resolvedCount),
    finished,
  }
}

export function isMatchFinished(state: MatchState): boolean {
  return state.phase === 'finished'
}

/** True after the Nth result has been recorded (may still be on reveal UI). */
export function isMatchComplete(state: MatchState): boolean {
  const total = state.totalRounds || MATCH_ROUNDS
  return state.resolvedCount >= total
}

/**
 * Apply a completed round result. Advances resolvedCount and score.
 * After totalRounds results, phase becomes finished (via continueMatch).
 */
export function applyMatchRoundResult(
  state: MatchState,
  result: RoundResult,
  nextScore: number,
): MatchState {
  const total = state.totalRounds || MATCH_ROUNDS
  if (state.phase === 'finished' || state.resolvedCount >= total) {
    return state
  }
  const streak = result.correct ? state.streak + 1 : 0
  const resolvedCount = state.resolvedCount + 1
  const history = [...state.history, result]
  const bestStreak = Math.max(state.bestStreak, streak)
  // Always land on round_reveal so the last answer can show feedback before end summary.
  return {
    roundIndex: Math.min(resolvedCount, total - 1),
    resolvedCount,
    score: nextScore,
    streak,
    bestStreak,
    phase: 'round_reveal',
    history,
    totalRounds: total,
  }
}

/** Advance from round_reveal → next playing round, or finished after last reveal. */
export function continueMatch(state: MatchState): MatchState {
  const total = state.totalRounds || MATCH_ROUNDS
  if (state.resolvedCount >= total) {
    return { ...state, phase: 'finished', totalRounds: total }
  }
  return {
    ...state,
    phase: 'playing',
    roundIndex: state.resolvedCount,
    totalRounds: total,
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
