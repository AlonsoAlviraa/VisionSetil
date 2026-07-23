/**
 * Setadle — LoLdle-style mushroom daily games (hub + play).
 * Educational only — never consumption permission.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { RiskChip } from '../components/RiskChip'
import { IconSearch } from '../components/icons'
import {
  SETADLE_MODES,
  buildSetadlePool,
  compareClassic,
  ensureSetadlePool,
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
  type SetadleMode,
  type SetadleSpecies,
} from '../lib/setadle'

type PlayKind = 'daily' | 'unlimited'

function toneClass(t: CellTone): string {
  return `setadle-cell setadle-cell--${t}`
}

export function SetadlePage() {
  const { mode: modeParam } = useParams<{ mode?: string }>()
  const navigate = useNavigate()
  const mode = (SETADLE_MODES.find((m) => m.id === modeParam)?.id || null) as SetadleMode | null

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
  const [guesses, setGuesses] = useState<ClassicGuessRow[]>([])
  const [won, setWon] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyDone, setDailyDone] = useState(false)

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

  // Bootstrap secret when mode/pool/playKind ready
  useEffect(() => {
    if (!mode || pool.length === 0) return
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
        // Show winning row only
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
      if (!secret || won) return
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
      setFocused(false)
      if (row.won) {
        setWon(true)
        if (playKind === 'daily') {
          writeDailyWin(mode!, secret.taxon, next.length)
          setDailyDone(true)
        }
      }
    },
    [secret, won, pool, guesses, playKind, mode],
  )

  const zoom = photoZoomForGuess(guesses.length)

  // ── Hub ──
  if (!mode) {
    return (
      <div className="page-setadle page-atelier-shell">
        <header className="setadle-hero">
          <p className="atelier-kicker">Daily · inspirado en LoLdle</p>
          <h1 className="page-title">Setadle</h1>
          <p className="page-subtitle">
            Adivina la seta del día. Cinco modos, pistas por colores. Solo orientación educativa —
            nunca permiso de consumo.
          </p>
          <p className="setadle-day">Hoy · {todayKey()}</p>
        </header>

        <div className="setadle-mode-grid">
          {SETADLE_MODES.map((m) => {
            const win = readDailyWin(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className="setadle-mode-card"
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
                  <span className="setadle-mode-card__cta">Jugar</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="setadle-legend atelier-panel">
          <h2>Colores (clásico)</h2>
          <div className="setadle-legend__row">
            <span className="setadle-cell setadle-cell--correct">Exacto</span>
            <span className="setadle-cell setadle-cell--partial">Parcial</span>
            <span className="setadle-cell setadle-cell--wrong">No</span>
          </div>
          <p className="setadle-disclaimer">
            No es una guía de forrajeo ni de consumo. Ante la duda, micólogo de carne y hueso.
          </p>
          <p className="setadle-links">
            <Link to="/reto">Reto clásico</Link>
            {' · '}
            <Link to="/lookalikes">Lookalikes</Link>
            {' · '}
            <Link to="/enciclopedia">Enciclopedia</Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Play ──
  const meta = SETADLE_MODES.find((m) => m.id === mode)!

  if (!ready || !secret) {
    return (
      <div className="page-setadle page-atelier-shell">
        <p className="muted">Cargando pool de especies…</p>
      </div>
    )
  }

  return (
    <div className="page-setadle page-atelier-shell">
      <header className="setadle-play-head">
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

      {/* Mode-specific clue panel */}
      <div className="setadle-clue-panel atelier-panel">
        {mode === 'clue' && (
          <blockquote className="setadle-quote">“{secret.tagline || secret.description}”</blockquote>
        )}
        {mode === 'trait' && (
          <p className="setadle-trait">
            <strong>Rasgo:</strong> {secret.trait}
          </p>
        )}
        {mode === 'emoji' && (
          <p className="setadle-emoji-clue" aria-label="Pista emoji">
            {secret.emojis}
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
              type="search"
              value={query}
              autoComplete="off"
              placeholder="Nombre común o científico…"
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
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
                <li key={s.slug}>
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
                    <RiskChip risk={s.risk} />
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

      {/* Guess grid */}
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
              {row.cells.map((c) => (
                <div key={c.key} className={toneClass(c.tone)} title={c.label}>
                  <span className="setadle-cell__k">{c.label}</span>
                  <span className="setadle-cell__v">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="setadle-disclaimer">
        Orientación de campo educativa. No autoriza recolección ni consumo.
      </p>
    </div>
  )
}

export default SetadlePage
