/**
 * Reto micológico — partida de 10 rondas + modos food/photo/name.
 * Calidad alimenticia solo documentada (sin inventar).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSpeciesImage } from '../hooks/useSpeciesImage'
import { foodQualityStats } from '../lib/foodQuality'
import {
  QUIZ_SECONDS,
  buildQuizPool,
  buildRound,
  ensureQuizCatalog,
  nextScore,
  scoreAnswer,
  type QuizMode,
  type QuizRound,
  type RoundResult,
} from '../lib/mushroomQuiz'
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
  type MatchState,
} from '../lib/quizMatch'

const LETTERS = ['A', 'B', 'C', 'D'] as const
const LETTER_COLORS = ['tri-a', 'tri-b', 'tri-c', 'tri-d'] as const
const BEST_KEY = 'visionsetil_quiz_best'

function QuizPhoto({
  taxon,
  risk,
  alt,
  large,
}: {
  taxon: string
  risk: string
  alt: string
  large?: boolean
}) {
  const { url, loading } = useSpeciesImage(taxon, { riskLabel: risk, context: 'eager' })
  return (
    <div className={`quiz-photo ${large ? 'quiz-photo--lg' : ''} ${loading ? 'is-loading' : ''}`}>
      <img src={url} alt={alt} loading="eager" decoding="async" />
    </div>
  )
}

function readBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_KEY) || '0')
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

type UiPhase = 'lobby' | 'playing' | 'reveal' | 'finished'

export function QuizGamePage() {
  const pool = useMemo(() => buildQuizPool(), [])
  const stats = useMemo(() => foodQualityStats(), [])
  const [mode, setMode] = useState<QuizMode>('food')
  const [match, setMatch] = useState<MatchState>(() => createMatchState())
  const [round, setRound] = useState<QuizRound | null>(null)
  const [seconds, setSeconds] = useState(QUIZ_SECONDS)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [locked, setLocked] = useState(false)
  const [lastGain, setLastGain] = useState(0)
  const [best, setBest] = useState(readBest)

  useEffect(() => {
    void ensureQuizCatalog()
  }, [])

  const progress = matchProgress(match)
  const summary = matchSummary(match)

  const uiPhase: UiPhase =
    match.phase === 'idle'
      ? 'lobby'
      : match.phase === 'finished'
        ? 'finished'
        : match.phase === 'round_reveal'
          ? 'reveal'
          : 'playing'

  const dealRound = useCallback(
    (m: QuizMode, matchState: MatchState) => {
      const r = buildRound(m, pool)
      setRound(r)
      setSeconds(QUIZ_SECONDS)
      setResult(null)
      setLocked(false)
      setLastGain(0)
      setMatch(matchState)
    },
    [pool],
  )

  const startMatchPlay = useCallback(
    (m: QuizMode = mode) => {
      const ms = startMatch()
      dealRound(m, ms)
    },
    [mode, dealRound],
  )

  const finishAnswer = useCallback(
    (pickedId: string | null, timedOut: boolean, secsLeft: number) => {
      if (!round || locked || isMatchFinished(match) || isMatchComplete(match)) return
      setLocked(true)
      const res = scoreAnswer(round, pickedId, secsLeft, timedOut)
      setResult(res)
      const after = nextScore(match.score, res)
      setLastGain(after - match.score)
      const next = applyMatchRoundResult(match, res, after)
      setMatch(next)
      if (after > best) {
        setBest(after)
        try {
          localStorage.setItem(BEST_KEY, String(after))
        } catch {
          /* ignore */
        }
      }
    },
    [round, locked, match, best],
  )

  useEffect(() => {
    if (uiPhase !== 'playing' || !round) return
    if (seconds <= 0) {
      finishAnswer(null, true, 0)
      return
    }
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [uiPhase, seconds, round, finishAnswer])

  const onPick = (id: string) => {
    if (uiPhase !== 'playing' || locked) return
    finishAnswer(id, false, seconds)
  }

  const goNext = () => {
    if (isMatchFinished(match)) return
    const cont = continueMatch(match)
    dealRound(mode, cont)
  }

  const backToLobby = () => {
    setMatch(createMatchState())
    setRound(null)
    setResult(null)
    setLocked(false)
  }

  useEffect(() => {
    if (uiPhase !== 'playing' || !round || locked) return
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const map: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 }
      const idx = map[k]
      if (idx == null) return
      e.preventDefault()
      if (round.mode === 'food') {
        const opt = round.options[idx]
        if (opt) onPick(opt.id)
      } else {
        const opt = round.options[idx]
        if (opt) onPick(opt.taxon)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [uiPhase, round, locked, seconds])

  const timerPct = (seconds / QUIZ_SECONDS) * 100
  const timerHot = seconds <= 8

  return (
    <div className="page-quiz">
      <div className="quiz-stage">
        <div className="quiz-stage__glow" aria-hidden="true" />

        <header className="quiz-topbar">
          <div className="quiz-brand">
            <span className="quiz-brand__badge">VS</span>
            <div>
              <strong>Reto micológico</strong>
              <em>Partida de {MATCH_ROUNDS} rondas · datos documentados</em>
            </div>
          </div>
          <div className="quiz-topbar__stats">
            <div className="quiz-pill">
              <span>Récord</span>
              <strong>{best}</strong>
            </div>
            {uiPhase !== 'lobby' && (
              <>
                <div className="quiz-pill">
                  <span>Puntos</span>
                  <strong>{match.score}</strong>
                </div>
                <div className="quiz-pill">
                  <span>Racha</span>
                  <strong>{match.streak}</strong>
                </div>
                <div className="quiz-pill">
                  <span>Ronda</span>
                  <strong>
                    {progress.currentDisplay}/{progress.total}
                  </strong>
                </div>
              </>
            )}
          </div>
        </header>

        {uiPhase === 'lobby' && (
          <section className="quiz-lobby-card">
            <div className="quiz-lobby-card__hero">
              <h1>Partida de {MATCH_ROUNDS}</h1>
              <p>
                {MATCH_ROUNDS} rondas · {QUIZ_SECONDS} s cada una · 4 respuestas. Solo calidad
                documentada — no inventamos comestibles.
              </p>
            </div>

            <div className="quiz-stats-bar" aria-label="Cobertura documentada">
              <div>
                <strong>{stats.total_documented}</strong>
                <span>documentadas</span>
              </div>
              <div>
                <strong>{stats.by_class.comestible}</strong>
                <span>comestibles</span>
              </div>
              <div>
                <strong>{stats.by_class.toxica + stats.by_class.mortal}</strong>
                <span>tóxicas/mortales</span>
              </div>
            </div>

            <div className="quiz-modes">
              {(
                [
                  {
                    id: 'food' as const,
                    title: '¿Comestible?',
                    desc: 'Comestible · no comestible · tóxica · mortal',
                    icon: '1',
                  },
                  {
                    id: 'photo' as const,
                    title: '¿Cuál es?',
                    desc: '4 fotos · elige la del nombre',
                    icon: '2',
                  },
                  {
                    id: 'name' as const,
                    title: '¿Cómo se llama?',
                    desc: '1 foto · 4 nombres',
                    icon: '3',
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`quiz-mode-card ${mode === m.id ? 'is-active' : ''}`}
                  onClick={() => setMode(m.id)}
                >
                  <span className="quiz-mode-card__n">{m.icon}</span>
                  <strong>{m.title}</strong>
                  <span>{m.desc}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="quiz-play-btn"
              onClick={() => startMatchPlay(mode)}
              disabled={pool.length < 4}
            >
              Empezar partida
            </button>
            <p className="quiz-lobby-meta">
              Mazo: {pool.length} setas documentadas · teclas A–D
            </p>
          </section>
        )}

        {uiPhase === 'finished' && (
          <section className="quiz-lobby-card quiz-finished">
            <div className="quiz-lobby-card__hero">
              <h1>¡Partida terminada!</h1>
              <p>
                {MATCH_ROUNDS} rondas resueltas. Solo orientación educativa — no autoriza consumo.
              </p>
            </div>
            <div className="quiz-stats-bar">
              <div>
                <strong>{summary.score}</strong>
                <span>puntos</span>
              </div>
              <div>
                <strong>
                  {summary.correctCount}/{summary.resolved}
                </strong>
                <span>aciertos</span>
              </div>
              <div>
                <strong>{Math.round(summary.accuracy * 100)}%</strong>
                <span>acierto</span>
              </div>
            </div>
            <p className="quiz-lobby-meta">Mejor racha en la partida: {summary.bestStreak}</p>
            <div className="quiz-feedback__actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="quiz-play-btn" onClick={() => startMatchPlay(mode)}>
                Otra partida
              </button>
              <button type="button" className="quiz-link-btn" onClick={backToLobby}>
                Cambiar modo
              </button>
            </div>
          </section>
        )}

        {(uiPhase === 'playing' || uiPhase === 'reveal') && round && (
          <section className="quiz-match">
            <div className="quiz-match-progress" aria-label="Progreso de partida">
              <div
                className="quiz-match-progress__bar"
                style={{ width: `${(match.resolvedCount / MATCH_ROUNDS) * 100}%` }}
              />
              <span>
                Ronda {progress.currentDisplay} de {progress.total}
              </span>
            </div>

            <div className={`quiz-clock ${timerHot ? 'is-hot' : ''}`} aria-live="polite">
              <div className="quiz-clock__ring" style={{ ['--pct' as string]: `${timerPct}%` }}>
                <div className="quiz-clock__inner">
                  <strong>{seconds}</strong>
                  <span>seg</span>
                </div>
              </div>
            </div>

            <div className="quiz-question-card">
              <p className="quiz-question-card__kicker">
                {round.mode === 'photo'
                  ? 'Elige la foto'
                  : round.mode === 'name'
                    ? 'Elige el nombre'
                    : 'Calidad documentada'}
              </p>
              <h2>{round.prompt}</h2>

              {(round.mode === 'name' || round.mode === 'food') && (
                <div className="quiz-question-card__media">
                  <QuizPhoto
                    taxon={round.subject.taxon}
                    risk={round.subject.risk_label}
                    alt={round.subject.common}
                    large
                  />
                </div>
              )}
            </div>

            {round.mode === 'photo' && (
              <div className="quiz-answers quiz-answers--photos">
                {round.options.map((opt, i) => {
                  const letter = LETTERS[i]
                  const tri = LETTER_COLORS[i]
                  const isCorrect = result && opt.taxon === round.correctId
                  const isPicked = result && result.pickedLabel === opt.common
                  return (
                    <button
                      key={opt.taxon}
                      type="button"
                      className={`quiz-answer quiz-answer--photo ${tri} ${
                        result
                          ? isCorrect
                            ? 'is-correct'
                            : isPicked
                              ? 'is-wrong'
                              : 'is-dim'
                          : ''
                      }`}
                      disabled={uiPhase !== 'playing' || locked}
                      onClick={() => onPick(opt.taxon)}
                    >
                      <span className={`quiz-answer__letter ${tri}`}>{letter}</span>
                      <QuizPhoto taxon={opt.taxon} risk={opt.risk_label} alt={`Opción ${letter}`} />
                      {result && (
                        <span className="quiz-answer__caption">
                          <strong>{opt.common}</strong>
                          <em>{opt.taxon}</em>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {round.mode === 'name' && (
              <div className="quiz-answers quiz-answers--text">
                {round.options.map((opt, i) => {
                  const letter = LETTERS[i]
                  const tri = LETTER_COLORS[i]
                  const isCorrect = result && opt.taxon === round.correctId
                  const isPicked = result?.pickedLabel === opt.common
                  return (
                    <button
                      key={opt.taxon}
                      type="button"
                      className={`quiz-answer quiz-answer--text ${tri} ${
                        result
                          ? isCorrect
                            ? 'is-correct'
                            : isPicked
                              ? 'is-wrong'
                              : 'is-dim'
                          : ''
                      }`}
                      disabled={uiPhase !== 'playing' || locked}
                      onClick={() => onPick(opt.taxon)}
                    >
                      <span className={`quiz-answer__letter ${tri}`}>{letter}</span>
                      <span className="quiz-answer__body">
                        <strong>{opt.common}</strong>
                        <em>{opt.taxon}</em>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {round.mode === 'food' && (
              <div className="quiz-answers quiz-answers--risk">
                {round.options.map((opt, i) => {
                  const letter = opt.letter || LETTERS[i]
                  const tri = LETTER_COLORS[i]
                  const isCorrect = result && opt.id === round.correctId
                  const isPicked = result?.pickedLabel === opt.label
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`quiz-answer quiz-answer--text quiz-answer--risk-${opt.color} ${tri} ${
                        result
                          ? isCorrect
                            ? 'is-correct'
                            : isPicked
                              ? 'is-wrong'
                              : 'is-dim'
                          : ''
                      }`}
                      disabled={uiPhase !== 'playing' || locked}
                      onClick={() => onPick(opt.id)}
                    >
                      <span className={`quiz-answer__letter ${tri}`}>{letter}</span>
                      <span className="quiz-answer__body">
                        <strong>{opt.label}</strong>
                        <em>{opt.hint}</em>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {uiPhase === 'reveal' && result && (
              <div
                className={`quiz-feedback ${result.correct ? 'is-ok' : 'is-ko'}`}
                role="status"
              >
                <div className="quiz-feedback__burst" aria-hidden="true">
                  {result.correct ? '+' + lastGain : result.timedOut ? '⏱' : '·'}
                </div>
                <div className="quiz-feedback__copy">
                  {result.timedOut ? (
                    <p>
                      <strong>¡Tiempo!</strong> Era: {result.correctLabel}
                    </p>
                  ) : result.correct ? (
                    <p>
                      <strong>¡Correcto!</strong>
                    </p>
                  ) : (
                    <p>
                      <strong>Casi…</strong> Correcta: {result.correctLabel}
                    </p>
                  )}
                  <p className="quiz-feedback__species">
                    {round.subject.common} · <em>{round.subject.taxon}</em>
                  </p>
                  {round.mode === 'food' && (
                    <p className="quiz-feedback__source">Fuente: {round.sourceNote}</p>
                  )}
                </div>
                <div className="quiz-feedback__actions">
                  <button type="button" className="quiz-play-btn quiz-play-btn--sm" onClick={goNext}>
                    {isMatchComplete(match)
                      ? 'Ver resultado final'
                      : `Siguiente (${match.resolvedCount + 1}/${MATCH_ROUNDS})`}
                  </button>
                  <Link to={`/enciclopedia/${round.subject.slug}`} className="quiz-link-btn">
                    Ver ficha
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default QuizGamePage
