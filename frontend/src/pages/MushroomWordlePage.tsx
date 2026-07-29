/**
 * Wordle de setas — adivina el **nombre común** letra a letra (no científico).
 * Al acertar o fallar → avanza solo al siguiente puzzle.
 * Educativo; nunca permiso de consumo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { RiskChip } from '../components/RiskChip'
import { recordStudyActivity } from '../lib/studyBadges'
import {
  WORDLE_MAX_GUESSES,
  WORDLE_NEXT_DELAY_MS,
  applyGuess,
  buildKeyboardTones,
  buildWordlePool,
  dayKey,
  ensureWordlePool,
  pickDailyWordle,
  pickNextWordle,
  wordleKeyboardForLocale,
  type WordlePhase,
  type WordleRow,
  type WordleSpecies,
} from '../lib/mushroomWordle'
import { scientificNameToSlug } from '../lib/slug'

type PlayKind = 'daily' | 'streak'

export function MushroomWordlePage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [pool, setPool] = useState<WordleSpecies[]>(() => {
    try {
      return buildWordlePool(undefined, locale)
    } catch {
      return []
    }
  })
  const [ready, setReady] = useState(pool.length > 0)
  const [playKind, setPlayKind] = useState<PlayKind>('streak')
  const [secret, setSecret] = useState<WordleSpecies | null>(null)
  const [rows, setRows] = useState<WordleRow[]>([])
  const [current, setCurrent] = useState('')
  const [phase, setPhase] = useState<WordlePhase>('playing')
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [streak, setStreak] = useState(0)
  const [round, setRound] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [stats, setStats] = useState({ won: 0, lost: 0 })

  useEffect(() => {
    let cancel = false
    void ensureWordlePool(locale).then((p) => {
      if (cancel) return
      setPool(p)
      setReady(true)
      setSecret(null) // re-deal with new locale pool
    })
    return () => {
      cancel = true
    }
  }, [locale])

  const keyboard = useMemo(() => wordleKeyboardForLocale(locale), [locale])

  const startRound = useCallback(
    (kind: PlayKind = playKind, exclude: string[] = recent) => {
      if (pool.length === 0) return
      const next =
        kind === 'daily'
          ? pickDailyWordle(pool, new Date(), locale)
          : pickNextWordle(pool, exclude)
      setSecret(next)
      setRows([])
      setCurrent('')
      setPhase('playing')
      setError(null)
      setCountdown(null)
      setRound((r) => r + 1)
    },
    [pool, playKind, recent, locale],
  )

  // First deal when pool ready
  useEffect(() => {
    if (!ready || pool.length === 0) return
    if (secret) return
    startRound(playKind, [])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on ready
  }, [ready, pool.length])

  const keyboardTones = useMemo(() => buildKeyboardTones(rows), [rows])
  const answerLen = secret?.answer.length ?? 0

  const submit = useCallback(() => {
    if (!secret || phase !== 'playing') return
    const result = applyGuess(rows, current, secret.answer)
    if (result.error === 'length:' + secret.answer.length || result.error?.startsWith('length')) {
      setError(
        t('wordle.errLength', {
          defaultValue: 'La palabra tiene {{n}} letras (sin espacios).',
          n: secret.answer.length,
        }),
      )
      return
    }
    if (result.error === 'duplicate') {
      setError(t('wordle.errDup', { defaultValue: 'Ya probaste esa palabra.' }))
      return
    }
    setRows(result.rows)
    setCurrent('')
    setError(null)
    setPhase(result.phase)

    if (result.phase === 'won') {
      setStreak((s) => s + 1)
      setStats((s) => ({ ...s, won: s.won + 1 }))
      recordStudyActivity('setadle', { won: true })
      setRecent((prev) => [...prev.slice(-12), secret.answer])
    } else if (result.phase === 'lost') {
      setStreak(0)
      setStats((s) => ({ ...s, lost: s.lost + 1 }))
      recordStudyActivity('setadle', { won: false })
      setRecent((prev) => [...prev.slice(-12), secret.answer])
    }
  }, [secret, phase, rows, current, t])

  // Physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing' || !secret) return
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        setCurrent((c) => c.slice(0, -1))
        setError(null)
        return
      }
      const ch = e.key.toUpperCase()
      if (/^[A-ZÑ]$/.test(ch) && current.length < answerLen) {
        setCurrent((c) => c + ch)
        setError(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, secret, submit, current.length, answerLen])

  // Auto-advance after win/loss
  useEffect(() => {
    if (phase !== 'won' && phase !== 'lost') return
    // Daily only auto-continues into streak mode after first resolve
    setCountdown(Math.ceil(WORDLE_NEXT_DELAY_MS / 1000))
    const tick = window.setInterval(() => {
      setCountdown((c) => (c == null || c <= 1 ? 0 : c - 1))
    }, 1000)
    const timer = window.setTimeout(() => {
      setPlayKind('streak')
      startRound(
        'streak',
        recent.includes(secret?.answer || '')
          ? recent
          : [...recent, secret?.answer || ''],
      )
    }, WORDLE_NEXT_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(tick)
    }
  }, [phase, startRound, recent, secret?.answer])

  const onVirtualKey = (key: string) => {
    if (phase !== 'playing' || !secret) return
    if (key === 'ENTER') {
      submit()
      return
    }
    if (key === '⌫') {
      setCurrent((c) => c.slice(0, -1))
      setError(null)
      return
    }
    if (current.length < answerLen) {
      setCurrent((c) => c + key)
      setError(null)
    }
  }

  const emptyRows = Math.max(0, WORDLE_MAX_GUESSES - rows.length - (phase === 'playing' ? 1 : 0))

  if (!ready) {
    return (
      <div className="cn-page page-wordle page-atelier-shell">
        <p className="wordle-loading">{t('wordle.loading', { defaultValue: 'Cargando pool…' })}</p>
      </div>
    )
  }

  if (pool.length === 0) {
    return (
      <div className="cn-page page-wordle page-atelier-shell">
        <p>{t('wordle.emptyPool', { defaultValue: 'No hay especies en el pool.' })}</p>
        <Link to="/setadle">{t('wordle.backSetadle', { defaultValue: 'Volver a Setadle' })}</Link>
      </div>
    )
  }

  return (
    <div className="cn-page page-wordle page-atelier-shell" data-testid="mushroom-wordle">
      <header className="wordle-hero">
        <p className="atelier-kicker">
          {t('wordle.kicker', {
            defaultValue: 'Wordle de setas · educativo · ronda {{n}}',
            n: round,
          })}
        </p>
        <h1>{t('wordle.title', { defaultValue: 'Setadle Wordle' })}</h1>
        <p className="wordle-lead">
          {t('wordle.lead', {
            defaultValue:
              'Adivina el nombre común de la seta (sin espacios) en {{max}} intentos. Verde = bien, ámbar = otra posición. Al acertar o fallar, pasa solo al siguiente.',
            max: WORDLE_MAX_GUESSES,
          })}
        </p>
        <div className="wordle-stats" aria-live="polite">
          <span>
            {t('wordle.streak', { defaultValue: 'Racha' })}: <strong>{streak}</strong>
          </span>
          <span>
            ✓ {stats.won} · ✗ {stats.lost}
          </span>
          <span>
            {t('wordle.day', { defaultValue: 'Hoy' })} {dayKey()}
          </span>
        </div>
        <div className="wordle-mode-row">
          <button
            type="button"
            className={`mkt-btn mkt-btn--ghost ${playKind === 'daily' ? 'is-active' : ''}`}
            onClick={() => {
              setPlayKind('daily')
              startRound('daily', [])
            }}
          >
            {t('wordle.daily', { defaultValue: 'Diario' })}
          </button>
          <button
            type="button"
            className={`mkt-btn mkt-btn--ghost ${playKind === 'streak' ? 'is-active' : ''}`}
            onClick={() => {
              setPlayKind('streak')
              startRound('streak', recent)
            }}
          >
            {t('wordle.streakMode', { defaultValue: 'Racha infinita' })}
          </button>
          <Link to="/setadle" className="mkt-btn mkt-btn--ghost">
            {t('wordle.toSetadle', { defaultValue: 'Otros modos Setadle' })}
          </Link>
        </div>
      </header>

      {secret && (
        <div className="wordle-meta-chip">
          <span>
            {t('wordle.letters', {
              defaultValue: '{{n}} letras',
              n: secret.answer.length,
            })}
          </span>
          <span>
            {t('wordle.hintFamily', {
              defaultValue: 'Familia: ??? (se revela al final)',
            })}
          </span>
        </div>
      )}

      <div className="wordle-board" role="grid" aria-label={t('wordle.boardAria', { defaultValue: 'Tablero' })}>
        {rows.map((row, ri) => (
          <div key={`r-${ri}`} className="wordle-row" role="row">
            {row.guess.split('').map((ch, ci) => (
              <span
                key={ci}
                className={`wordle-cell wordle-cell--${row.tones[ci]}`}
                role="gridcell"
              >
                {ch}
              </span>
            ))}
          </div>
        ))}
        {phase === 'playing' && secret && (
          <div className="wordle-row wordle-row--current" role="row">
            {Array.from({ length: answerLen }).map((_, i) => (
              <span
                key={i}
                className={`wordle-cell ${current[i] ? 'wordle-cell--tbd' : 'wordle-cell--empty'}`}
                role="gridcell"
              >
                {current[i] || ''}
              </span>
            ))}
          </div>
        )}
        {Array.from({ length: emptyRows }).map((_, i) => (
          <div key={`e-${i}`} className="wordle-row" role="row">
            {Array.from({ length: answerLen || 8 }).map((__, j) => (
              <span key={j} className="wordle-cell wordle-cell--empty" role="gridcell" />
            ))}
          </div>
        ))}
      </div>

      {error && (
        <p className="wordle-error" role="alert">
          {error}
        </p>
      )}

      {(phase === 'won' || phase === 'lost') && secret && (
        <section
          className={`wordle-reveal wordle-reveal--${phase}`}
          data-testid="wordle-reveal"
          aria-live="polite"
        >
          <div className="wordle-reveal__media">
            <SpeciesThumb
              taxon={secret.taxon}
              riskLabel={secret.risk_label}
              size={88}
              alt={secret.taxon}
            />
          </div>
          <div>
            <h2>
              {phase === 'won'
                ? t('wordle.won', { defaultValue: '¡Acertaste!' })
                : t('wordle.lost', { defaultValue: 'Se acabaron los intentos' })}
            </h2>
            <p className="wordle-reveal__taxon">
              <strong>{secret.common}</strong>
            </p>
            <p>
              <em>{secret.taxon}</em>
            </p>
            <RiskChip risk={secret.risk_label} />
            <p className="wordle-reveal__next">
              {countdown != null && countdown > 0
                ? t('wordle.nextIn', {
                    defaultValue: 'Siguiente en {{s}} s…',
                    s: countdown,
                  })
                : t('wordle.nextNow', { defaultValue: 'Cargando siguiente…' })}
            </p>
            <div className="wordle-reveal__actions">
              <button
                type="button"
                className="mkt-btn mkt-btn--primary"
                data-testid="wordle-next-now"
                onClick={() =>
                  startRound('streak', [...recent, secret.answer])
                }
              >
                {t('wordle.nextNowBtn', { defaultValue: 'Siguiente ya' })}
              </button>
              <Link
                to={`/enciclopedia/${secret.slug || scientificNameToSlug(secret.taxon)}`}
                className="mkt-btn mkt-btn--ghost"
              >
                {t('wordle.openFiche', { defaultValue: 'Ver ficha' })}
              </Link>
            </div>
            <p className="wordle-safety">
              {t('wordle.safety', {
                defaultValue:
                  'Solo juego educativo. No autoriza recolección ni consumo.',
              })}
            </p>
            <p
              className="wordle-safety wordle-multiview-tip"
              data-testid="wordle-multiview-tip"
              role="note"
            >
              {t('wordle.multiviewTip', {
                defaultValue:
                  'En campo real: prioriza láminas, perfil y base — multi-foto sin esas vistas no basta. Solo orientación, nunca consumo.',
              })}{' '}
              <Link to="/educacion">{t('nav.education', { defaultValue: 'Educación' })}</Link>
              {' · '}
              <Link to="/identificar">
                {t('nav.tryIdentify', { defaultValue: 'Probar Identificar' })}
              </Link>
            </p>
          </div>
        </section>
      )}

      {phase === 'playing' && (
        <div className="wordle-keyboard" aria-label={t('wordle.kbAria', { defaultValue: 'Teclado' })}>
          {keyboard.map((row, ri) => (
            <div key={ri} className="wordle-keyboard__row">
              {row.map((key) => {
                const tone = key.length === 1 ? keyboardTones[key] : undefined
                return (
                  <button
                    key={key}
                    type="button"
                    className={`wordle-key ${tone ? `wordle-key--${tone}` : ''} ${
                      key === 'ENTER' || key === '⌫' ? 'wordle-key--wide' : ''
                    }`}
                    onClick={() => onVirtualKey(key)}
                  >
                    {key === 'ENTER'
                      ? t('wordle.enter', { defaultValue: 'Enviar' })
                      : key}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MushroomWordlePage
