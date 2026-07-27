/**
 * Setadle — LoLdle-style mushroom daily games (hub + play).
 * Educational only — never consumption permission.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  normalizeSetadleMode,
  photoZoomForGuess,
  pickDailySecret,
  pickUnlimitedSecret,
  readDailyWin,
  resolveGuess,
  todayKey,
  typeaheadPool,
  writeDailyWin,
  type CellTone,
  type ClassicGuessRow,
  type HabitatRound,
  type SetadleSpecies,
} from '../lib/setadle'

type PlayKind = 'daily' | 'unlimited'

function toneClass(t: CellTone): string {
  return `setadle-cell setadle-cell--${t}`
}

export function SetadlePage() {
  const { mode: modeParam } = useParams<{ mode?: string }>()
  const navigate = useNavigate()
  const mode = normalizeSetadleMode(modeParam)

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
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancel = false
    void ensureSetadlePool().then((p) => {
      if (!cancel) {
        setPool(p)
        setReady(true)
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
        setError('Especie no encontrada en el pool. Prueba otro nombre.')
        return
      }
      if (guesses.some((x) => x.taxon === g.taxon)) {
        setError('Ya has probado esa especie.')
        return
      }
      const row = compareClassic(g, secret)
      const next = [row, ...guesses]
      setGuesses(next)
      setQuery('')
      setError(null)
      if (row.won) {
        setWon(true)
        setFocused(false)
        if (playKind === 'daily') {
          writeDailyWin(mode!, secret.taxon, next.length)
          setDailyDone(true)
        }
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
    [secret, won, pool, guesses, playKind, mode],
  )

  const onHabitatWin = useCallback(
    (attempts: number) => {
      if (!habitatRound) return
      setWon(true)
      if (playKind === 'daily') {
        writeDailyWin('habitat', habitatRound.habitat.id, attempts)
        setDailyDone(true)
      }
    },
    [habitatRound, playKind],
  )

  const zoom = photoZoomForGuess(guesses.length)

  // ── Hub ──
  if (!mode) {
    return (
      <div className="page-setadle page-setadle--mkt page-atelier-shell">
        <header className="setadle-hero setadle-hero--mkt">
          <p className="atelier-kicker" style={{ color: '#e8c872', justifyContent: 'center' }}>
            Daily · al estilo LoLdle
          </p>
          <h1 className="page-title">Setadle</h1>
          <p className="page-subtitle">
            Cinco minijuegos. Una seta al día. Colores que enseñan. Solo educación — nunca consumo.
          </p>
          <p className="setadle-day">Hoy · {todayKey()}</p>
          <ul className="setadle-hero__chips" aria-label="Características">
            <li>5 modos</li>
            <li>Diario + ilimitado</li>
            <li>Riesgo visible</li>
          </ul>
          <div className="setadle-hero__board">
            <SetadleBoardMock compact caption="Exacto · cerca · no" />
          </div>
        </header>

        <div className="setadle-mode-grid">
          {SETADLE_MODES.map((m) => {
            const win = readDailyWin(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`setadle-mode-card ${win ? 'is-done' : ''}`}
                onClick={() => navigate(`/setadle/${m.id}`)}
              >
                <span className="setadle-mode-card__emoji" aria-hidden>
                  {m.emoji}
                </span>
                <span className="setadle-mode-card__title">{m.title}</span>
                <span className="setadle-mode-card__blurb">{m.blurb}</span>
                {win ? (
                  <span className="setadle-mode-card__done">✓ {win.guesses} intentos</span>
                ) : (
                  <span className="setadle-mode-card__cta">Jugar →</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="setadle-legend atelier-panel">
          <h2>Cómo leer el clásico</h2>
          <div className="setadle-legend__row">
            <span className="setadle-cell setadle-cell--correct">Exacto</span>
            <span className="setadle-cell setadle-cell--partial">Cerca</span>
            <span className="setadle-cell setadle-cell--wrong">No</span>
          </div>
          <p className="setadle-disclaimer">
            No es guía de forrajeo ni de consumo. Ante la duda, micólogo humano.
          </p>
          <p className="setadle-links">
            <Link to="/lookalikes">Lookalikes</Link>
            {' · '}
            <Link to="/enciclopedia">Enciclopedia</Link>
            {' · '}
            <Link to="/reto">Reto</Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Play ──
  const meta = SETADLE_MODES.find((m) => m.id === mode)!
  const waiting =
    !ready || (mode === 'habitat' ? !habitatRound : !secret)

  if (waiting) {
    return (
      <div className="page-setadle page-setadle--mkt page-atelier-shell">
        <p className="muted">Cargando pool de especies…</p>
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
            onClick={() => setPlayKind('unlimited')}
          >
            Ilimitado
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
                  {habitatRound.habitat.icon} {habitatRound.habitat.title}
                </strong>
              </p>
              <p>
                {dailyDone && playKind === 'daily' ? 'Diario completado · ' : ''}
                Orientación educativa — no es guía de recolección.
              </p>
              <div className="setadle-win__actions">
                {playKind === 'unlimited' && (
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--primary"
                    onClick={() => {
                      setHabitatRound(buildHabitatRound(pool, todayKey(), 'unlimited'))
                      setHabitatKey((k) => k + 1)
                      setWon(false)
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

          {!won && (
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

          {won && (
            <div className="setadle-win atelier-panel" role="status">
              <h2>¡Correcto!</h2>
              <p>
                <strong>{secret.common}</strong> · <em>{secret.taxon}</em>
              </p>
              <p>
                {guesses.length} intento{guesses.length === 1 ? '' : 's'}
                {dailyDone && playKind === 'daily' ? ' · diario completado' : ''}
              </p>
              <div className="setadle-win__actions">
                <Link to={`/enciclopedia/${secret.slug}`} className="btn-atelier btn-atelier--ghost">
                  Ver ficha
                </Link>
                {playKind === 'unlimited' && (
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--primary"
                    onClick={() => {
                      setSecret(pickUnlimitedSecret(pool, secret.taxon))
                      setGuesses([])
                      setWon(false)
                    }}
                  >
                    Otra partida
                  </button>
                )}
                <Link to="/setadle" className="btn-atelier btn-atelier--ghost">
                  Otros modos
                </Link>
              </div>
            </div>
          )}

          <div className="setadle-grid-wrap">
            {guesses.length === 0 && !won && (
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
                    const display = classicCellDisplay(c.key, c.value)
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
