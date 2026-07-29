/**
 * Setadle — LoLdle-style mushroom daily games (hub + play).
 * Educational only — never consumption permission.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { RiskChip } from '../components/RiskChip'
import { IconSearch } from '../components/icons'
import { SetadleBoardMock } from '../components/marketing/SetadleBoardMock'
import { HabitatSortGame } from '../components/setadle/HabitatSortGame'
import {
  SETADLE_MODES,
  buildHabitatRound,
  buildSetadlePool,
  classicCellDisplay,
  compareClassic,
  ensureSetadlePool,
  habitatTitle,
  normalizeSetadleMode,
  photoZoomForGuess,
  pickDailySecret,
  pickUnlimitedSecret,
  readDailyWin,
  resolveGuess,
  todayKey,
  typeaheadPool,
  writeDailyWin as writeDailyWinBase,
  type CellTone,
  type ClassicGuessRow,
  type HabitatRound,
  type SetadleMode,
  type SetadleSpecies,
} from '../lib/setadle'
import {
  canAccess,
  usePlanActions,
} from '../lib/entitlements'
import { ProPlanBanner } from '../components/ProPlanBanner'
import { recordStudyActivity } from '../lib/studyBadges'
import { StudyBadgesPanel } from '../components/StudyBadgesPanel'

type PlayKind = 'daily' | 'unlimited'

/** Free: classic daily only. Pro: all modes + unlimited. */
const FREE_SETADLE_MODES: SetadleMode[] = ['classic']

function writeDailyWin(mode: SetadleMode, taxon: string, guesses: number): void {
  writeDailyWinBase(mode, taxon, guesses)
  // Educational study badge (Seek-style) — never edible framing
  recordStudyActivity('setadle', { won: true })
}

function toneClass(t: CellTone): string {
  return `setadle-cell setadle-cell--${t}`
}

const MODE_TITLE_KEYS: Record<SetadleMode, string> = {
  classic: 'setadle.modeClassic',
  clue: 'setadle.modeClue',
  trait: 'setadle.modeTrait',
  habitat: 'setadle.modeHabitat',
  photo: 'setadle.modePhoto',
}

const MODE_BLURB_KEYS: Record<SetadleMode, string> = {
  classic: 'setadle.modeClassicBlurb',
  clue: 'setadle.modeClueBlurb',
  trait: 'setadle.modeTraitBlurb',
  habitat: 'setadle.modeHabitatBlurb',
  photo: 'setadle.modePhotoBlurb',
}

export function SetadlePage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const { mode: modeParam } = useParams<{ mode?: string }>()
  const navigate = useNavigate()
  const mode = normalizeSetadleMode(modeParam)
  const { isPro: pro, unlock } = usePlanActions()
  /** Pending Pro mode — requires explicit Activar click (no auto-unlock on explore). */
  const [pendingProMode, setPendingProMode] = useState<SetadleMode | 'unlimited' | null>(
    null,
  )

  // Redirect legacy /setadle/emoji → /setadle/habitat
  useEffect(() => {
    if (modeParam === 'emoji') navigate('/setadle/habitat', { replace: true })
  }, [modeParam, navigate])

  const [pool, setPool] = useState<SetadleSpecies[]>(() => {
    try {
      return buildSetadlePool()
    } catch {
      return []
    }
  })
  const [ready, setReady] = useState(pool.length > 0)
  const [poolError, setPoolError] = useState<string | null>(null)
  const [playKind, setPlayKind] = useState<PlayKind>('daily')
  const [secret, setSecret] = useState<SetadleSpecies | null>(null)
  const [habitatRound, setHabitatRound] = useState<HabitatRound | null>(null)
  const [habitatKey, setHabitatKey] = useState(0)
  const [guesses, setGuesses] = useState<ClassicGuessRow[]>([])
  const [won, setWon] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyDone, setDailyDone] = useState(false)
  const [lost, setLost] = useState(false)
  const [autoNextIn, setAutoNextIn] = useState<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  /** Classic-style modes: max attempts then auto-next (Wordle rhythm). */
  const MAX_NAME_GUESSES = 8

  useEffect(() => {
    let cancel = false
    void ensureSetadlePool()
      .then((p) => {
        if (!cancel) {
          setPool(p)
          setReady(true)
          setPoolError(
            p.length === 0
              ? t('setadle.poolEmpty', {
                  defaultValue: 'No hay especies en el pool de juego.',
                })
              : null,
          )
        }
      })
      .catch(() => {
        if (!cancel) {
          setReady(true)
          setPoolError(
            t('setadle.poolLoadFail', {
              defaultValue: 'No se pudo cargar el catálogo para Setadle.',
            }),
          )
        }
      })
    return () => {
      cancel = true
    }
  }, [])

  // Bootstrap when mode/pool/playKind ready
  useEffect(() => {
    if (!mode || pool.length === 0) return

    if (mode === 'habitat') {
      const round = buildHabitatRound(pool, todayKey(), playKind)
      setHabitatRound(round)
      setHabitatKey((k) => k + 1)
      setSecret(null)
      setGuesses([])
      setError(null)
      if (playKind === 'daily') {
        const win = readDailyWin('habitat')
        if (win && win.taxon === round.habitat.id) {
          setDailyDone(true)
          setWon(true)
        } else {
          setDailyDone(false)
          setWon(false)
        }
      } else {
        setDailyDone(false)
        setWon(false)
      }
      return
    }

    setHabitatRound(null)
    if (playKind === 'daily') {
      const win = readDailyWin(mode)
      const sec = pickDailySecret(pool, mode)
      setSecret(sec)
      setGuesses([])
      setWon(false)
      setLost(false)
      setError(null)
      if (win && win.taxon === sec.taxon) {
        setDailyDone(true)
        setWon(true)
        const g = pool.find((p) => p.taxon === sec.taxon) || sec
        setGuesses([compareClassic(g, sec)])
      } else {
        setDailyDone(false)
      }
    } else {
      setSecret(pickUnlimitedSecret(pool))
      setGuesses([])
      setWon(false)
      setLost(false)
      setDailyDone(false)
      setError(null)
    }
  }, [mode, pool, playKind])

  const typeahead = useMemo(() => {
    if (query.trim().length < 1) return []
    return typeaheadPool(pool, query, 8).filter(
      (p) => !guesses.some((g) => g.taxon === p.taxon),
    )
  }, [pool, query, guesses])

  const submitGuess = useCallback(
    (raw: string) => {
      if (!secret || won || mode === 'habitat') return
      const g = resolveGuess(pool, raw)
      if (!g) {
        setError(
          t('setadle.notFound', {
            defaultValue: 'Especie no encontrada en el pool. Prueba otro nombre.',
          }),
        )
        return
      }
      if (guesses.some((x) => x.taxon === g.taxon)) {
        setError(
          t('setadle.alreadyTried', { defaultValue: 'Ya has probado esa especie.' }),
        )
        return
      }
      const row = compareClassic(g, secret)
      const next = [row, ...guesses]
      setGuesses(next)
      setQuery('')
      setError(null)
      if (row.won) {
        setWon(true)
        setLost(false)
        setFocused(false)
        if (playKind === 'daily') {
          writeDailyWin(mode!, secret.taxon, next.length)
          setDailyDone(true)
        }
      } else if (next.length >= MAX_NAME_GUESSES) {
        setLost(true)
        setWon(false)
        setFocused(false)
        recordStudyActivity('setadle', { won: false })
      } else {
        // Keep typeahead ready for the next attempt.
        // Do NOT leave focused=false while the input still has DOM focus
        // (onFocus won't fire again and suggestions disappear).
        setFocused(true)
        requestAnimationFrame(() => {
          searchInputRef.current?.focus()
        })
      }
    },
    [secret, won, pool, guesses, playKind, mode, t],
  )

  // Auto-advance to next puzzle after win (unlimited) or loss (any playKind name mode)
  useEffect(() => {
    if (!mode || mode === 'habitat') return
    const finished = won || lost
    if (!finished) {
      setAutoNextIn(null)
      return
    }
    // Daily win: stay on result (one per day). Unlimited or loss → next.
    if (playKind === 'daily' && won && !lost) {
      setAutoNextIn(null)
      return
    }
    setAutoNextIn(2)
    const tick = window.setInterval(() => {
      setAutoNextIn((n) => (n == null || n <= 1 ? 0 : n - 1))
    }, 1000)
    const tmr = window.setTimeout(() => {
      setPlayKind('unlimited')
      setSecret(pickUnlimitedSecret(pool))
      setGuesses([])
      setWon(false)
      setLost(false)
      setDailyDone(false)
      setError(null)
      setQuery('')
      setAutoNextIn(null)
    }, 2200)
    return () => {
      window.clearTimeout(tmr)
      window.clearInterval(tick)
    }
  }, [won, lost, mode, playKind, pool])

  const onHabitatWin = useCallback(
    (attempts: number) => {
      if (!habitatRound) return
      setWon(true)
      setLost(false)
      if (playKind === 'daily') {
        writeDailyWin('habitat', habitatRound.habitat.id, attempts)
        setDailyDone(true)
      }
    },
    [habitatRound, playKind],
  )

  // Habitat unlimited: auto-next after win
  useEffect(() => {
    if (mode !== 'habitat' || !won || playKind !== 'unlimited') return
    setAutoNextIn(2)
    const tick = window.setInterval(() => {
      setAutoNextIn((n) => (n == null || n <= 1 ? 0 : n - 1))
    }, 1000)
    const tmr = window.setTimeout(() => {
      setHabitatRound(buildHabitatRound(pool, todayKey(), 'unlimited'))
      setHabitatKey((k) => k + 1)
      setWon(false)
      setAutoNextIn(null)
    }, 2200)
    return () => {
      window.clearTimeout(tmr)
      window.clearInterval(tick)
    }
  }, [mode, won, playKind, pool])

  const zoom = photoZoomForGuess(guesses.length)

  // ── Hub ──
  if (!mode) {
    return (
      <div className="page-setadle page-setadle--mkt page-atelier-shell">
        <header className="setadle-hero setadle-hero--mkt">
          <p className="atelier-kicker" style={{ color: '#e8c872', justifyContent: 'center' }}>
            {t('setadle.kicker', {
              defaultValue: 'Daily · al estilo LoLdle · {{plan}}',
              plan: pro ? 'Pro' : 'Free',
            })}
          </p>
          <h1 className="page-title">
            {t('setadle.title', { defaultValue: 'Setadle' })}
          </h1>
          <p className="page-subtitle">
            {t('setadle.subtitle', {
              defaultValue:
                'Free: clásico diario. Pro: cinco modos e ilimitado. Colores que enseñan. Solo educación — nunca consumo.',
            })}
          </p>
          <p className="setadle-day">
            {t('setadle.today', { defaultValue: 'Hoy · {{day}}', day: todayKey() })}
          </p>
          <ul
            className="setadle-hero__chips"
            aria-label={t('setadle.featuresAria', { defaultValue: 'Características' })}
          >
            <li>
              {pro
                ? t('setadle.chipModesPro', { defaultValue: '5 modos' })
                : t('setadle.chipModesFree', { defaultValue: '1 modo Free' })}
            </li>
            <li>
              {pro
                ? t('setadle.chipDailyPro', { defaultValue: 'Diario + ilimitado' })
                : t('setadle.chipDailyFree', { defaultValue: 'Diario Free' })}
            </li>
            <li>{t('setadle.chipRisk', { defaultValue: 'Riesgo visible' })}</li>
          </ul>
          <div className="setadle-hero__board">
            <SetadleBoardMock
              compact
              caption={t('setadle.boardCaption', {
                defaultValue: 'Exacto · cerca · no',
              })}
            />
          </div>
          <div className="setadle-hero__wordle-cta" style={{ marginTop: '0.75rem' }}>
            <Link
              to="/wordle"
              className="mkt-btn mkt-btn--primary"
              data-testid="setadle-cta-wordle"
            >
              {t('setadle.ctaWordle', {
                defaultValue: 'Wordle de setas →',
              })}
            </Link>
            <p className="setadle-hero__wordle-blurb">
              {t('setadle.wordleBlurb', {
                defaultValue:
                  'Como el Wordle: letras del nombre común (níscalo, oronja…). Al acertar o fallar, sigue al siguiente.',
              })}
            </p>
          </div>
          <StudyBadgesPanel compact />
        </header>

        {pendingProMode && pendingProMode !== 'unlimited' && !pro && (
          <div
            className="atelier-panel setadle-unlock-sheet"
            data-testid="setadle-unlock-sheet"
            role="dialog"
            aria-labelledby="setadle-unlock-title"
          >
            <h2 id="setadle-unlock-title">
              {t('setadle.proMode', { defaultValue: 'Modo Pro' })}
            </h2>
            <p>
              {t('setadle.proUnlockBody', {
                defaultValue:
                  '«{{mode}}» es Pro. Free mantiene el clásico diario. Confirma para activar demo local en este dispositivo.',
                mode: t(MODE_TITLE_KEYS[pendingProMode as SetadleMode] || 'setadle.title', {
                  defaultValue:
                    SETADLE_MODES.find((x) => x.id === pendingProMode)?.title ||
                    String(pendingProMode),
                }),
              })}
            </p>
            <div className="identify-mode-toggle" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="mkt-btn mkt-btn--amber"
                data-testid="setadle-unlock-pro"
                onClick={() => {
                  unlock()
                  const target = pendingProMode
                  setPendingProMode(null)
                  navigate(`/setadle/${target}`)
                }}
              >
                {t('setadle.activatePro', { defaultValue: 'Activar Pro demo' })}
              </button>
              <button
                type="button"
                className="mkt-btn mkt-btn--ghost"
                onClick={() => setPendingProMode(null)}
              >
                {t('setadle.stayFree', { defaultValue: 'Seguir en Free' })}
              </button>
            </div>
            <ProPlanBanner compact showTable={false} />
          </div>
        )}

        <div className="setadle-mode-grid">
          {SETADLE_MODES.map((m) => {
            const win = readDailyWin(m.id)
            const locked = !pro && !FREE_SETADLE_MODES.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`setadle-mode-card ${win ? 'is-done' : ''} ${locked ? 'is-locked' : ''}`}
                onClick={() => {
                  if (locked) {
                    setPendingProMode(m.id)
                    return
                  }
                  navigate(`/setadle/${m.id}`)
                }}
                data-pro-locked={locked ? '1' : '0'}
              >
                <span className="setadle-mode-card__emoji" aria-hidden>
                  {m.emoji}
                </span>
                <span className="setadle-mode-card__title">
                  {t(MODE_TITLE_KEYS[m.id], { defaultValue: m.title })}
                  {locked ? ' · Pro' : ''}
                </span>
                <span className="setadle-mode-card__blurb">
                  {t(MODE_BLURB_KEYS[m.id], { defaultValue: m.blurb })}
                </span>
                {win ? (
                  <span className="setadle-mode-card__done">
                    {t('setadle.attempts', {
                      defaultValue: '✓ {{n}} intentos',
                      n: win.guesses,
                    })}
                  </span>
                ) : locked ? (
                  <span className="setadle-mode-card__cta">
                    {t('setadle.seePro', { defaultValue: 'Ver Pro →' })}
                  </span>
                ) : (
                  <span className="setadle-mode-card__cta">
                    {t('setadle.playCta', { defaultValue: 'Jugar →' })}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="setadle-legend atelier-panel">
          <h2>{t('setadle.howToRead', { defaultValue: 'Cómo leer el clásico' })}</h2>
          <div className="setadle-legend__row">
            <span className="setadle-cell setadle-cell--correct">
              {t('setadle.exact', { defaultValue: 'Exacto' })}
            </span>
            <span className="setadle-cell setadle-cell--partial">
              {t('setadle.close', { defaultValue: 'Cerca' })}
            </span>
            <span className="setadle-cell setadle-cell--wrong">
              {t('setadle.no', { defaultValue: 'No' })}
            </span>
          </div>
          <p className="setadle-disclaimer">
            {t('setadle.disclaimer', {
              defaultValue:
                'No es guía de forrajeo ni de consumo. Ante la duda, micólogo humano.',
            })}
          </p>
          <p
            className="setadle-disclaimer setadle-multiview-tip"
            data-testid="setadle-multiview-tip"
            role="note"
          >
            {t('setadle.multiviewTip', {
              defaultValue:
                'Colores del juego no son ID de campo. En la seta real: láminas + perfil + base. Multi-foto sin ellas no basta — solo orientación, nunca consumo.',
            })}
          </p>
          <p className="setadle-links">
            <Link to="/lookalikes">{t('nav.lookalikes', { defaultValue: 'Lookalikes' })}</Link>
            {' · '}
            <Link to="/enciclopedia">
              {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
            </Link>
            {' · '}
            <Link to="/educacion">{t('nav.education', { defaultValue: 'Educación' })}</Link>
            {' · '}
            <Link to="/identificar">
              {t('nav.tryIdentify', { defaultValue: 'Probar Identificar' })}
            </Link>
            {' · '}
            <Link to="/reto">{t('nav.quiz', { defaultValue: 'Reto' })}</Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Play ──
  const meta = SETADLE_MODES.find((m) => m.id === mode)!
  const waiting =
    !ready || (mode === 'habitat' ? !habitatRound : !secret)
  const unlimitedOk = pro || canAccess('setadle_unlimited').allowed
  const modeOk = pro || FREE_SETADLE_MODES.includes(mode)

  if (!modeOk && !pro) {
    return (
      <div className="page-setadle page-setadle--mkt page-atelier-shell">
        <header className="setadle-play-head mkt-page-head">
          <Link to="/setadle" className="setadle-back">
            {t('setadle.backModes', { defaultValue: '← Modos' })}
          </Link>
          <h1 className="page-title">
            {t('setadle.proMode', { defaultValue: 'Modo Pro' })}
          </h1>
          <p className="page-subtitle">
            {t('setadle.freeOnlyClassic', {
              defaultValue:
                'Free incluye el clásico diario. Confirma para activar Pro demo (modos extra e ilimitado).',
            })}
          </p>
          <button
            type="button"
            className="mkt-btn mkt-btn--amber"
            onClick={() => {
              unlock()
              navigate(`/setadle/${mode}`)
            }}
            data-testid="setadle-unlock-pro"
          >
            {t('setadle.activatePro', { defaultValue: 'Activar Pro demo' })}
          </button>
          <div style={{ marginTop: '1rem' }}>
            <ProPlanBanner compact />
          </div>
        </header>
      </div>
    )
  }

  if (waiting) {
    return (
      <div className="page-setadle page-setadle--mkt page-atelier-shell">
        <p className="muted">
          {t('setadle.loading', { defaultValue: 'Cargando pool de especies…' })}
        </p>
      </div>
    )
  }

  if (poolError || pool.length === 0) {
    return (
      <div className="page-setadle page-setadle--mkt page-atelier-shell" data-testid="setadle-pool-error">
        <header className="mkt-page-head mkt-mesh">
          <h1 className="page-title">
            {t('setadle.title', { defaultValue: 'Setadle' })}
          </h1>
          <p className="page-subtitle" role="alert">
            {poolError ||
              t('setadle.poolError', {
                defaultValue: 'No hay especies disponibles para jugar.',
              })}
          </p>
          <Link to="/enciclopedia" className="mkt-btn mkt-btn--primary">
            {t('setadle.goEncyclopedia', { defaultValue: 'Ir a Enciclopedia' })}
          </Link>
        </header>
      </div>
    )
  }

  return (
    <div className="page-setadle page-setadle--mkt page-atelier-shell">
      <header className="setadle-play-head mkt-page-head mkt-mesh">
        <Link to="/setadle" className="setadle-back">
          ← Modos
        </Link>
        <h1 className="page-title">
          {meta.emoji} {meta.title}
        </h1>
        <p className="page-subtitle">{meta.blurb}</p>
        {pendingProMode === 'unlimited' && !unlimitedOk && (
          <div className="atelier-panel" data-testid="setadle-unlimited-sheet" role="dialog">
            <p>Ilimitado es Pro. Confirma para activar demo local.</p>
            <div className="identify-mode-toggle">
              <button
                type="button"
                className="mkt-btn mkt-btn--amber"
                data-testid="setadle-unlock-unlimited"
                onClick={() => {
                  unlock()
                  setPendingProMode(null)
                  setPlayKind('unlimited')
                }}
              >
                Activar Pro demo
              </button>
              <button
                type="button"
                className="mkt-btn mkt-btn--ghost"
                onClick={() => setPendingProMode(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        <div className="identify-mode-toggle">
          <button
            type="button"
            className={
              playKind === 'daily'
                ? 'btn-atelier btn-atelier--primary'
                : 'btn-atelier btn-atelier--ghost'
            }
            onClick={() => setPlayKind('daily')}
          >
            Diario
          </button>
          <button
            type="button"
            className={
              playKind === 'unlimited'
                ? 'btn-atelier btn-atelier--primary'
                : 'btn-atelier btn-atelier--ghost'
            }
            onClick={() => {
              if (!unlimitedOk) {
                setPendingProMode('unlimited')
                return
              }
              setPlayKind('unlimited')
            }}
            data-testid="setadle-unlimited"
            title={unlimitedOk ? undefined : 'Ilimitado es Pro — requiere confirmación'}
          >
            Ilimitado{unlimitedOk ? '' : ' · Pro'}
          </button>
        </div>
      </header>

      {/* ── Habitat mode (replaces emoji) ── */}
      {mode === 'habitat' && habitatRound && (
        <>
          <HabitatSortGame
            key={`${habitatKey}-${playKind}-${habitatRound.habitat.id}`}
            round={habitatRound}
            disabled={won && playKind === 'daily' && dailyDone}
            onWin={onHabitatWin}
          />
          {won && (
            <div className="setadle-win atelier-panel" role="status">
              <h2>¡Hábitat resuelto!</h2>
              <p>
                <strong>
                  {habitatRound.habitat.icon}{' '}
                  {habitatTitle(habitatRound.habitat.id, locale)}
                </strong>
              </p>
              <p>
                {dailyDone && playKind === 'daily' ? 'Diario completado · ' : ''}
                Orientación educativa — no es guía de recolección.
              </p>
              {autoNextIn != null && playKind === 'unlimited' && (
                <p data-testid="setadle-habitat-auto-next">
                  {t('setadle.autoNext', {
                    defaultValue: 'Siguiente partida en {{s}} s…',
                    s: autoNextIn,
                  })}
                </p>
              )}
              <div className="setadle-win__actions">
                {playKind === 'unlimited' && (
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--primary"
                    onClick={() => {
                      setHabitatRound(buildHabitatRound(pool, todayKey(), 'unlimited'))
                      setHabitatKey((k) => k + 1)
                      setWon(false)
                      setAutoNextIn(null)
                    }}
                  >
                    Otra partida
                  </button>
                )}
                <Link to="/setadle" className="btn-atelier btn-atelier--ghost">
                  Otros modos
                </Link>
                <Link to="/enciclopedia" className="btn-atelier btn-atelier--ghost">
                  Enciclopedia
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Name-guess modes ── */}
      {mode !== 'habitat' && secret && (
        <>
          <div className="setadle-clue-panel atelier-panel">
            {mode === 'clue' && (
              <blockquote className="setadle-quote">
                “{secret.tagline || secret.description}”
              </blockquote>
            )}
            {mode === 'trait' && (
              <p className="setadle-trait">
                <strong>Rasgo:</strong> {secret.trait}
              </p>
            )}
            {mode === 'photo' && (
              <div className="setadle-photo-frame">
                <div
                  className="setadle-photo-zoom"
                  style={{
                    transform: `scale(${zoom})`,
                  }}
                >
                  <SpeciesThumb
                    taxon={secret.taxon}
                    riskLabel={secret.risk_raw}
                    size={320}
                    variant="card"
                    className="setadle-photo-thumb"
                  />
                </div>
                <p className="setadle-photo-hint">
                  Zoom {zoom.toFixed(1)}× · se aleja con cada fallo
                </p>
              </div>
            )}
            {mode === 'classic' && (
              <p className="setadle-classic-hint">
                Escribe una especie. Cada celda compara atributos con la respuesta del día.
              </p>
            )}
          </div>

          {!won && !lost && (
            <div className="setadle-search lookalike-search-panel atelier-panel">
              <div className={`lookalike-search ${focused ? 'is-focused' : ''}`}>
                <IconSearch size={18} />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  autoComplete="off"
                  placeholder="Nombre común o científico…"
                  onChange={(e) => {
                    setQuery(e.target.value)
                    // Typing always opens suggestions (covers “still focused after guess”).
                    setFocused(true)
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 180)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitGuess(typeahead[0]?.taxon || query)
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-atelier btn-atelier--primary"
                  disabled={!query.trim()}
                  onClick={() => submitGuess(typeahead[0]?.taxon || query)}
                >
                  Probar
                </button>
              </div>
              {focused && typeahead.length > 0 && (
                <ul className="lookalike-typeahead" role="listbox">
                  {typeahead.map((s) => (
                    <li key={s.slug || s.taxon}>
                      <button
                        type="button"
                        className="lookalike-typeahead__item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => submitGuess(s.taxon)}
                      >
                        <SpeciesThumb taxon={s.taxon} riskLabel={s.risk_raw} size={36} />
                        <span className="lookalike-typeahead__text">
                          <strong>{s.common}</strong>
                          <em>{s.taxon}</em>
                        </span>
                        <RiskChip risk={s.risk_raw || s.risk} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p className="lookalike-error" role="status">
                  {error}
                </p>
              )}
            </div>
          )}

          {(won || lost) && secret && (
            <div
              className={`setadle-win atelier-panel ${lost ? 'setadle-win--lost' : ''}`}
              role="status"
              data-testid="setadle-round-end"
            >
              <h2>
                {won
                  ? t('setadle.correct', { defaultValue: '¡Correcto!' })
                  : t('setadle.lostTitle', { defaultValue: 'Sin acierto' })}
              </h2>
              <p>
                <strong>{secret.common}</strong> · <em>{secret.taxon}</em>
              </p>
              {lost && (
                <p>
                  {t('setadle.lostBody', {
                    defaultValue: 'Límite de {{n}} intentos. Pasa al siguiente…',
                    n: MAX_NAME_GUESSES,
                  })}
                </p>
              )}
              <p>
                {guesses.length} intento{guesses.length === 1 ? '' : 's'}
                {dailyDone && playKind === 'daily' && won ? ' · diario completado' : ''}
              </p>
              {autoNextIn != null && (
                <p data-testid="setadle-auto-next">
                  {t('setadle.autoNext', {
                    defaultValue: 'Siguiente partida en {{s}} s…',
                    s: autoNextIn,
                  })}
                </p>
              )}
              <div className="setadle-win__actions">
                <Link to={`/enciclopedia/${secret.slug}`} className="btn-atelier btn-atelier--ghost">
                  Ver ficha
                </Link>
                <button
                  type="button"
                  className="btn-atelier btn-atelier--primary"
                  data-testid="setadle-next-now"
                  onClick={() => {
                    setPlayKind('unlimited')
                    setSecret(pickUnlimitedSecret(pool, secret.taxon))
                    setGuesses([])
                    setWon(false)
                    setLost(false)
                    setDailyDone(false)
                    setAutoNextIn(null)
                  }}
                >
                  {t('setadle.nextNow', { defaultValue: 'Siguiente ya' })}
                </button>
                <Link to="/wordle" className="btn-atelier btn-atelier--ghost">
                  Wordle
                </Link>
                <Link to="/setadle" className="btn-atelier btn-atelier--ghost">
                  Otros modos
                </Link>
              </div>
            </div>
          )}

          <div className="setadle-grid-wrap">
            {guesses.length === 0 && !won && !lost && (
              <p className="muted setadle-empty-guess">Aún no hay intentos. ¡Empieza!</p>
            )}
            {guesses.map((row) => (
              <div key={row.taxon + row.slug} className="setadle-guess-row">
                <div className="setadle-guess-name">
                  <SpeciesThumb taxon={row.taxon} size={32} />
                  <div>
                    <strong>{row.common}</strong>
                    <em>{row.taxon}</em>
                  </div>
                  {row.won && <span className="setadle-guess-ok">✓</span>}
                </div>
                <div className="setadle-cells">
                  {row.cells.map((c) => {
                    const display = classicCellDisplay(c.key, c.value, locale)
                    return (
                      <div
                        key={c.key}
                        className={toneClass(c.tone)}
                        title={`${c.label}: ${display}`}
                      >
                        <span className="setadle-cell__k">{c.label}</span>
                        <span className="setadle-cell__v">{display}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="setadle-disclaimer">
        Orientación de campo educativa. No autoriza recolección ni consumo.
      </p>
    </div>
  )
}

export default SetadlePage
