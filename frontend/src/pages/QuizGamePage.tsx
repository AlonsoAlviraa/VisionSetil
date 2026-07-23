/**
 * Reto micológico — daily challenge (D-11) + free match.
 * Food quality only from documented registry; educational framing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from '../components/SpeciesImage'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { foodQualityStats } from '../lib/foodQuality'
import { riskToPlaceholder } from '../lib/edibility'
import {
  DAILY_MATCH_ROUNDS,
  DAILY_QUIZ_SECONDS,
  QUIZ_SECONDS,
  buildDailyChallenge,
  buildQuizPool,
  buildRound,
  dayKey,
  ensureQuizCatalog,
  nextScore,
  readAllTimeBest,
  readDailyBest,
  scoreAnswer,
  writeAllTimeBest,
  writeDailyBest,
  type QuizMode,
  type QuizPlayKind,
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
  const kind = riskToPlaceholder(risk)
  if (large) {
    return (
      <div className="quiz-photo quiz-photo--lg">
        <SpeciesImage
          scientificName={taxon}
          riskLevel={kind}
          alt={alt}
          variant="card"
          layout="fill"
          priority
          className="quiz-photo__img"
        />
      </div>
    )
  }
  return (
    <div className="quiz-photo">
      <SpeciesThumb taxon={taxon} riskLabel={risk} alt={alt} size={120} fill priority />
    </div>
  )
}

type UiPhase = 'lobby' | 'playing' | 'reveal' | 'finished'

export function QuizGamePage() {
  const { t } = useTranslation()
  const [pool, setPool] = useState(() => buildQuizPool())
  const [catalogReady, setCatalogReady] = useState(false)
  const stats = useMemo(() => foodQualityStats(), [])
  const today = useMemo(() => dayKey(), [])
  const [mode, setMode] = useState<QuizMode>('food')
  const [playKind, setPlayKind] = useState<QuizPlayKind>('daily')
  const [match, setMatch] = useState<MatchState>(() => createMatchState(DAILY_MATCH_ROUNDS))
  const [round, setRound] = useState<QuizRound | null>(null)
  const [seconds, setSeconds] = useState(DAILY_QUIZ_SECONDS)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [locked, setLocked] = useState(false)
  const [lastGain, setLastGain] = useState(0)
  const [best, setBest] = useState(readAllTimeBest)
  const [dailyBest, setDailyBest] = useState(() => {
    const rec = readDailyBest()
    return rec.day === dayKey() ? rec.score : 0
  })
  /** Precomputed daily rounds (deterministic seed). */
  const dailyRoundsRef = useRef<QuizRound[] | null>(null)
  const [roundTimerMax, setRoundTimerMax] = useState(DAILY_QUIZ_SECONDS)
  const finishAnswerRef = useRef<
    ((pickedId: string | null, timedOut: boolean, secsLeft: number) => void) | null
  >(null)
  const secondsRef = useRef(seconds)
  secondsRef.current = seconds

  useEffect(() => {
    let cancelled = false
    void ensureQuizCatalog().then(() => {
      if (cancelled) return
      // Rebuild pool after catalog hydrate so slug/common match encyclopedia (issue 11)
      setPool(buildQuizPool())
      setCatalogReady(true)
    })
    return () => {
      cancelled = true
    }
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

  const dealFromDaily = useCallback((matchState: MatchState, index: number) => {
    const pack = dailyRoundsRef.current
    if (!pack || !pack[index]) return
    setRound(pack[index])
    setSeconds(DAILY_QUIZ_SECONDS)
    setRoundTimerMax(DAILY_QUIZ_SECONDS)
    setResult(null)
    setLocked(false)
    setLastGain(0)
    setMatch(matchState)
  }, [])

  const dealFreeRound = useCallback(
    (m: QuizMode, matchState: MatchState) => {
      const r = buildRound(m, pool)
      setRound(r)
      setSeconds(QUIZ_SECONDS)
      setRoundTimerMax(QUIZ_SECONDS)
      setResult(null)
      setLocked(false)
      setLastGain(0)
      setMatch(matchState)
    },
    [pool],
  )

  const startDaily = useCallback(() => {
    if (pool.length < 4) return
    setPlayKind('daily')
    dailyRoundsRef.current = buildDailyChallenge(pool, new Date(), DAILY_MATCH_ROUNDS)
    const ms = startMatch(createMatchState(DAILY_MATCH_ROUNDS), DAILY_MATCH_ROUNDS)
    dealFromDaily(ms, 0)
  }, [pool, dealFromDaily])

  const startFree = useCallback(
    (m: QuizMode = mode) => {
      setPlayKind('free')
      dailyRoundsRef.current = null
      const ms = startMatch(createMatchState(MATCH_ROUNDS), MATCH_ROUNDS)
      dealFreeRound(m, ms)
    },
    [mode, dealFreeRound],
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
      const newBest = writeAllTimeBest(after)
      setBest(newBest)
      if (playKind === 'daily') {
        const rec = writeDailyBest(today, after)
        setDailyBest(rec.score)
      }
    },
    [round, locked, match, playKind, today],
  )
  finishAnswerRef.current = finishAnswer

  useEffect(() => {
    if (uiPhase !== 'playing' || !round) return
    if (seconds <= 0) {
      finishAnswerRef.current?.(null, true, 0)
      return
    }
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [uiPhase, seconds, round])

  const onPick = useCallback(
    (id: string) => {
      if (uiPhase !== 'playing' || locked) return
      finishAnswer(id, false, secondsRef.current)
    },
    [uiPhase, locked, finishAnswer],
  )

  const goNext = () => {
    if (isMatchFinished(match)) return
    const cont = continueMatch(match)
    // Issue 8: do not deal a throwaway round after match ends
    if (cont.phase === 'finished') {
      setMatch(cont)
      setRound(null)
      setResult(null)
      setLocked(false)
      return
    }
    if (playKind === 'daily') {
      dealFromDaily(cont, cont.roundIndex)
    } else {
      dealFreeRound(mode, cont)
    }
  }

  const backToLobby = () => {
    setMatch(createMatchState(playKind === 'daily' ? DAILY_MATCH_ROUNDS : MATCH_ROUNDS))
    setRound(null)
    setResult(null)
    setLocked(false)
    dailyRoundsRef.current = null
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
  }, [uiPhase, round, locked, onPick])

  const timerPct = (seconds / roundTimerMax) * 100
  const timerHot = seconds <= 8
  const totalRounds = progress.total

  return (
    <div className="page-quiz">
      <div className="quiz-stage">
        <div className="quiz-stage__glow" aria-hidden="true" />

        <header className="quiz-topbar">
          <div className="quiz-brand">
            <span className="quiz-brand__badge">VS</span>
            <div>
              <strong>{t('quiz.brand', { defaultValue: 'Reto micológico' })}</strong>
              <em>
                {playKind === 'daily' && uiPhase !== 'lobby'
                  ? t('quiz.dailySub', {
                      defaultValue: 'Reto del día · datos documentados',
                    })
                  : t('quiz.freeSub', {
                      rounds: totalRounds,
                      defaultValue: 'Partida de {{rounds}} rondas · datos documentados',
                    })}
              </em>
            </div>
          </div>
          <div className="quiz-topbar__stats">
            <div className="quiz-pill">
              <span>{t('quiz.record', { defaultValue: 'Récord' })}</span>
              <strong>{best}</strong>
            </div>
            <div className="quiz-pill" title={today}>
              <span>{t('quiz.dailyBest', { defaultValue: 'Hoy' })}</span>
              <strong>{dailyBest}</strong>
            </div>
            {uiPhase !== 'lobby' && (
              <>
                <div className="quiz-pill">
                  <span>{t('quiz.points', { defaultValue: 'Puntos' })}</span>
                  <strong>{match.score}</strong>
                </div>
                <div className="quiz-pill">
                  <span>{t('quiz.streak', { defaultValue: 'Racha' })}</span>
                  <strong>{match.streak}</strong>
                </div>
                <div className="quiz-pill">
                  <span>{t('quiz.round', { defaultValue: 'Ronda' })}</span>
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
              <p className="quiz-lobby-kicker">
                {t('quiz.kicker', { defaultValue: 'Educación · no consumo' })}
              </p>
              <h1>{t('quiz.dailyTitle', { defaultValue: 'Reto del día' })}</h1>
              <p>
                {t('quiz.dailyBody', {
                  rounds: DAILY_MATCH_ROUNDS,
                  seconds: DAILY_QUIZ_SECONDS,
                  defaultValue:
                    '{{rounds}} rondas · {{seconds}} s · mismo desafío para todo el día. Solo calidad alimenticia documentada — no inventamos comestibles.',
                })}
              </p>
            </div>

            <div className="quiz-stats-bar" aria-label={t('quiz.coverageAria', { defaultValue: 'Cobertura documentada' })}>
              <div>
                <strong>{stats.total_documented}</strong>
                <span>{t('quiz.documented', { defaultValue: 'documentadas' })}</span>
              </div>
              <div>
                <strong>{stats.by_class.comestible}</strong>
                <span>{t('quiz.ediblesDoc', { defaultValue: 'comestibles*' })}</span>
              </div>
              <div>
                <strong>{stats.by_class.toxica + stats.by_class.mortal}</strong>
                <span>{t('quiz.toxicDoc', { defaultValue: 'tóxicas/mortales' })}</span>
              </div>
            </div>

            <button
              type="button"
              className="quiz-play-btn"
              onClick={startDaily}
              disabled={pool.length < 4 || !catalogReady}
              data-testid="quiz-start-daily"
            >
              {t('quiz.startDaily', { defaultValue: 'Jugar reto del día' })}
            </button>
            <p className="quiz-lobby-meta">
              {t('quiz.dailyMeta', {
                day: today,
                best: dailyBest,
                defaultValue: 'Hoy {{day}} · mejor del día: {{best}} · teclas A–D',
              })}
            </p>

            <div className="quiz-lobby-divider">
              <span>{t('quiz.orFree', { defaultValue: 'o partida libre' })}</span>
            </div>

            <div className="quiz-modes">
              {(
                [
                  {
                    id: 'food' as const,
                    title: t('quiz.modeFood', { defaultValue: '¿Comestible?' }),
                    desc: t('quiz.modeFoodDesc', {
                      defaultValue: 'Comestible · no comestible · tóxica · mortal',
                    }),
                    icon: '1',
                  },
                  {
                    id: 'photo' as const,
                    title: t('quiz.modePhoto', { defaultValue: '¿Cuál es?' }),
                    desc: t('quiz.modePhotoDesc', {
                      defaultValue: '4 fotos · elige la del nombre',
                    }),
                    icon: '2',
                  },
                  {
                    id: 'name' as const,
                    title: t('quiz.modeName', { defaultValue: '¿Cómo se llama?' }),
                    desc: t('quiz.modeNameDesc', {
                      defaultValue: '1 foto · 4 nombres',
                    }),
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
              className="quiz-play-btn quiz-play-btn--ghost"
              onClick={() => startFree(mode)}
              disabled={pool.length < 4 || !catalogReady}
              data-testid="quiz-start-free"
            >
              {t('quiz.startFree', {
                rounds: MATCH_ROUNDS,
                defaultValue: 'Partida libre ({{rounds}} rondas)',
              })}
            </button>
            <p className="quiz-lobby-meta">
              {t('quiz.deckMeta', {
                count: pool.length,
                defaultValue: 'Mazo: {{count}} setas documentadas · *referencia educativa, no permiso de consumo',
              })}
            </p>
          </section>
        )}

        {uiPhase === 'finished' && (
          <section className="quiz-lobby-card quiz-finished">
            <div className="quiz-lobby-card__hero">
              <h1>
                {playKind === 'daily'
                  ? t('quiz.dailyDone', { defaultValue: '¡Reto del día completado!' })
                  : t('quiz.freeDone', { defaultValue: '¡Partida terminada!' })}
              </h1>
              <p>
                {t('quiz.doneBody', {
                  rounds: totalRounds,
                  defaultValue:
                    '{{rounds}} rondas resueltas. Solo orientación educativa — no autoriza consumo.',
                })}
              </p>
            </div>
            <div className="quiz-stats-bar">
              <div>
                <strong>{summary.score}</strong>
                <span>{t('quiz.points', { defaultValue: 'puntos' })}</span>
              </div>
              <div>
                <strong>
                  {summary.correctCount}/{summary.resolved}
                </strong>
                <span>{t('quiz.hits', { defaultValue: 'aciertos' })}</span>
              </div>
              <div>
                <strong>{Math.round(summary.accuracy * 100)}%</strong>
                <span>{t('quiz.accuracy', { defaultValue: 'acierto' })}</span>
              </div>
            </div>
            <p className="quiz-lobby-meta">
              {t('quiz.bestStreak', {
                n: summary.bestStreak,
                defaultValue: 'Mejor racha en la partida: {{n}}',
              })}
              {playKind === 'daily'
                ? ` · ${t('quiz.dailyBestLine', {
                    n: dailyBest,
                    defaultValue: 'mejor del día: {{n}}',
                  })}`
                : ''}
            </p>
            <div className="quiz-feedback__actions" style={{ justifyContent: 'center' }}>
              {playKind === 'daily' ? (
                <button type="button" className="quiz-play-btn" onClick={startDaily}>
                  {t('quiz.replayDaily', { defaultValue: 'Repetir reto del día' })}
                </button>
              ) : (
                <button type="button" className="quiz-play-btn" onClick={() => startFree(mode)}>
                  {t('quiz.another', { defaultValue: 'Otra partida' })}
                </button>
              )}
              <button type="button" className="quiz-link-btn" onClick={backToLobby}>
                {t('quiz.backLobby', { defaultValue: 'Volver al lobby' })}
              </button>
            </div>
          </section>
        )}

        {(uiPhase === 'playing' || uiPhase === 'reveal') && round && (
          <section className="quiz-match">
            <div className="quiz-match-progress" aria-label={t('quiz.progressAria', { defaultValue: 'Progreso de partida' })}>
              <div
                className="quiz-match-progress__bar"
                style={{ width: `${(match.resolvedCount / totalRounds) * 100}%` }}
              />
              <span>
                {t('quiz.roundOf', {
                  current: progress.currentDisplay,
                  total: progress.total,
                  defaultValue: 'Ronda {{current}} de {{total}}',
                })}
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
                  ? t('quiz.kickerPhoto', { defaultValue: 'Elige la foto' })
                  : round.mode === 'name'
                    ? t('quiz.kickerName', { defaultValue: 'Elige el nombre' })
                    : t('quiz.kickerFood', { defaultValue: 'Calidad documentada' })}
              </p>
              <h2>
                {round.mode === 'photo'
                  ? t('quiz.prompt.photo', {
                      name: round.subject.common,
                      defaultValue: round.prompt,
                    })
                  : round.mode === 'name'
                    ? t('quiz.prompt.name', { defaultValue: round.prompt })
                    : t('quiz.prompt.food', { defaultValue: round.prompt })}
              </h2>

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
                        <strong>
                          {t(`quiz.food.${opt.id}.label`, { defaultValue: opt.label })}
                        </strong>
                        <em>
                          {t(`quiz.food.${opt.id}.hint`, { defaultValue: opt.hint })}
                        </em>
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
                  {(() => {
                    const correctShown =
                      round.mode === 'food'
                        ? t(`quiz.food.${round.correctId}.label`, {
                            defaultValue: result.correctLabel,
                          })
                        : result.correctLabel
                    if (result.timedOut) {
                      return (
                        <p>
                          <strong>{t('quiz.timeout', { defaultValue: '¡Tiempo!' })}</strong>{' '}
                          {t('quiz.was', { defaultValue: 'Era' })}: {correctShown}
                        </p>
                      )
                    }
                    if (result.correct) {
                      return (
                        <p>
                          <strong>{t('quiz.correct', { defaultValue: '¡Correcto!' })}</strong>
                        </p>
                      )
                    }
                    return (
                      <p>
                        <strong>{t('quiz.almost', { defaultValue: 'Casi…' })}</strong>{' '}
                        {t('quiz.correctWas', { defaultValue: 'Correcta' })}: {correctShown}
                      </p>
                    )
                  })()}
                  <p className="quiz-feedback__species">
                    {round.subject.common} · <em>{round.subject.taxon}</em>
                  </p>
                  {round.mode === 'food' && (
                    <p className="quiz-feedback__source">
                      {t('quiz.source', { defaultValue: 'Fuente' })}: {round.sourceNote}
                    </p>
                  )}
                </div>
                <div className="quiz-feedback__actions">
                  <button type="button" className="quiz-play-btn quiz-play-btn--sm" onClick={goNext}>
                    {isMatchComplete(match)
                      ? t('quiz.seeFinal', { defaultValue: 'Ver resultado final' })
                      : t('quiz.next', {
                          n: match.resolvedCount + 1,
                          total: totalRounds,
                          defaultValue: 'Siguiente ({{n}}/{{total}})',
                        })}
                  </button>
                  <Link to={`/enciclopedia/${round.subject.slug}`} className="quiz-link-btn">
                    {t('quiz.viewCard', { defaultValue: 'Ver ficha' })}
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
