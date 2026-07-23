import { describe, expect, it } from 'vitest'
import {
  MATCH_ROUNDS,
  applyMatchRoundResult,
  continueMatch,
  createMatchState,
  isMatchComplete,
  isMatchFinished,
  matchProgress,
  matchSummary,
  startMatch,
} from './quizMatch'
import type { RoundResult } from './mushroomQuiz'

function res(correct: boolean, scoreLeft = 20): RoundResult {
  return {
    correct,
    timedOut: false,
    secondsLeft: scoreLeft,
    correctLabel: 'x',
    pickedLabel: correct ? 'x' : 'y',
  }
}

describe('quizMatch 10-round state machine', () => {
  it('starts idle and begins playing on startMatch', () => {
    const idle = createMatchState()
    expect(idle.phase).toBe('idle')
    expect(idle.resolvedCount).toBe(0)
    expect(idle.totalRounds).toBe(MATCH_ROUNDS)
    const m = startMatch()
    expect(m.phase).toBe('playing')
    expect(matchProgress(m).total).toBe(MATCH_ROUNDS)
    expect(MATCH_ROUNDS).toBe(10)
  })

  it('supports shorter daily match length', () => {
    let m = startMatch(createMatchState(6), 6)
    expect(matchProgress(m).total).toBe(6)
    let score = 0
    for (let i = 0; i < 6; i++) {
      score += 10
      m = applyMatchRoundResult(m, res(true), score)
      if (!isMatchComplete(m)) m = continueMatch(m)
    }
    expect(isMatchComplete(m)).toBe(true)
    m = continueMatch(m)
    expect(m.phase).toBe('finished')
    expect(m.resolvedCount).toBe(6)
  })

  it('accumulates score across rounds and finishes after 10', () => {
    let m = startMatch()
    let score = 0
    for (let i = 0; i < MATCH_ROUNDS; i++) {
      expect(isMatchFinished(m)).toBe(false)
      score += 15
      m = applyMatchRoundResult(m, res(true, 20), score)
      expect(m.phase).toBe('round_reveal')
      if (i < MATCH_ROUNDS - 1) {
        m = continueMatch(m)
        expect(m.phase).toBe('playing')
      }
    }
    expect(m.resolvedCount).toBe(10)
    expect(isMatchComplete(m)).toBe(true)
    m = continueMatch(m)
    expect(m.phase).toBe('finished')
    expect(isMatchFinished(m)).toBe(true)
    expect(m.score).toBe(score)
    const sum = matchSummary(m)
    expect(sum.correctCount).toBe(10)
    expect(sum.accuracy).toBe(1)
    expect(sum.resolved).toBe(10)
  })

  it('breaks streak on wrong answer but keeps score', () => {
    let m = startMatch()
    m = applyMatchRoundResult(m, res(true), 20)
    expect(m.streak).toBe(1)
    m = continueMatch(m)
    m = applyMatchRoundResult(m, res(false), 20)
    expect(m.streak).toBe(0)
    expect(m.score).toBe(20)
    expect(m.resolvedCount).toBe(2)
  })

  it('ignores extra results after match is complete', () => {
    let m = startMatch()
    let score = 0
    for (let i = 0; i < MATCH_ROUNDS; i++) {
      score += 10
      m = applyMatchRoundResult(m, res(i % 2 === 0), score)
      if (!isMatchComplete(m)) m = continueMatch(m)
    }
    expect(isMatchComplete(m)).toBe(true)
    const frozen = m.score
    const again = applyMatchRoundResult(m, res(true), frozen + 999)
    expect(again.score).toBe(frozen)
    expect(again.resolvedCount).toBe(MATCH_ROUNDS)
  })
})
