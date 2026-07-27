/**
 * Learn gallery — many flashcards, each a mini photo-reel (changes every 3s).
 * Featured also auto-plays angles.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiskChip } from '../RiskChip'
import { scientificNameToSlug } from '../../lib/slug'
import {
  buildSpeciesMediaStack,
  photoPriorityScore,
  uniqueMediaStack,
} from '../../lib/speciesMediaStack'
import { LEARN_TAXA, type LearnTaxon } from './learnTaxa'
import { MiniPhotoReel } from './MiniPhotoReel'

export type { LearnTaxon }
export { LEARN_TAXA }

const REEL_MS = 1500

type Props = {
  className?: string
}

export function LearnGallery({ className = '' }: Props) {
  const ordered = useMemo(
    () =>
      [...LEARN_TAXA].sort(
        (a, b) => photoPriorityScore(b.taxon) - photoPriorityScore(a.taxon),
      ),
    [],
  )

  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const active = ordered[activeIdx] ?? ordered[0]
  const slug = scientificNameToSlug(active.taxon)

  const stack = useMemo(
    () =>
      uniqueMediaStack(
        buildSpeciesMediaStack(active.taxon, { maxGallery: 5, includeCatalog: true }),
      ).slice(0, 6),
    [active.taxon],
  )
  const [angleIdx, setAngleIdx] = useState(0)
  const [aliveStack, setAliveStack] = useState(stack)
  const [heroFade, setHeroFade] = useState(true)

  useEffect(() => {
    setAliveStack(stack)
    setAngleIdx(0)
    setHeroFade(true)
  }, [stack])

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Featured: auto mini-video every 3s (angles, then next species when loop ends)
  useEffect(() => {
    if (paused || reduced) return
    const n = Math.max(1, aliveStack.length)
    const t = window.setInterval(() => {
      setHeroFade(false)
      window.setTimeout(() => {
        setAngleIdx((i) => {
          const next = i + 1
          if (next >= n) {
            // after full angle loop → next species
            setActiveIdx((si) => (si + 1) % ordered.length)
            return 0
          }
          return next
        })
        setHeroFade(true)
      }, 200)
    }, REEL_MS)
    return () => window.clearInterval(t)
  }, [aliveStack.length, ordered.length, paused, reduced])

  const current = aliveStack[angleIdx] || aliveStack[0]

  const go = (dir: -1 | 1) => {
    setActiveIdx((i) => (i + dir + ordered.length) % ordered.length)
  }

  return (
    <div
      className={`mkt-learn mkt-learn--grid ${className}`.trim()}
      data-testid="learn-gallery"
    >
      <p className="mkt-learn__auto-hint" aria-live="polite">
        {paused || reduced
          ? 'Pausado · clic en Reanudar o en el vídeo'
          : 'Mini-vídeo · cada 1,5 s · clic para pausar'}
      </p>

      <div className="mkt-learn__featured">
        <div
          className="mkt-learn__photo mkt-learn__photo--clickable"
          role="button"
          tabIndex={0}
          aria-label={paused ? 'Reanudar mini-vídeo' : 'Pausar mini-vídeo'}
          onClick={() => setPaused((p) => !p)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setPaused((p) => !p)
            }
          }}
        >
          {current ? (
            <img
              key={current.url}
              src={current.url}
              alt={`${active.name} (${active.taxon})`}
              className={`mkt-learn__hero-img ${heroFade ? 'is-in' : 'is-out'}`}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              crossOrigin={current.sameOrigin ? undefined : 'anonymous'}
              onError={() => {
                setAliveStack((prev) => {
                  if (prev.length <= 1) return prev
                  const next = prev.filter((_, i) => i !== angleIdx)
                  setAngleIdx(0)
                  return next
                })
              }}
            />
          ) : null}
          <div className="mkt-learn__photo-overlay">
            <RiskChip risk={active.risk} />
          </div>
          <span className={`mkt-learn__play-badge ${paused ? 'is-paused' : ''}`}>
            {paused ? '▶' : '❚❚'}
          </span>
          <div
            className="mkt-learn__angle-bar"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="mkt-learn__angle-btn"
              onClick={() => {
                setPaused(true)
                setAngleIdx((i) => (i - 1 + aliveStack.length) % Math.max(1, aliveStack.length))
              }}
              aria-label="Ángulo anterior"
            >
              ‹
            </button>
            <span>
              {aliveStack.length ? `${angleIdx + 1}/${aliveStack.length}` : '—'} · 1,5 s
            </span>
            <button
              type="button"
              className="mkt-learn__angle-btn"
              onClick={() => {
                setPaused(true)
                setAngleIdx((i) => (i + 1) % Math.max(1, aliveStack.length))
              }}
              aria-label="Ángulo siguiente"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mkt-learn__info">
          <p className="mkt-kicker">Estudio · mini-vídeo</p>
          <h3 className="mkt-learn__name">{active.name}</h3>
          <em className="mkt-learn__taxon">{active.taxon}</em>
          <p className="mkt-learn__blurb">{active.blurb}</p>

          <div className="mkt-learn__nav">
            <button
              type="button"
              className="mkt-learn__arrow"
              onClick={() => {
                setPaused(true)
                go(-1)
              }}
              aria-label="Seta anterior"
            >
              ←
            </button>
            <span className="mkt-learn__count">
              {activeIdx + 1} / {ordered.length}
            </span>
            <button
              type="button"
              className="mkt-learn__arrow"
              onClick={() => {
                setPaused(true)
                go(1)
              }}
              aria-label="Seta siguiente"
            >
              →
            </button>
          </div>

          <div className="mkt-cta-row" style={{ marginTop: '1rem' }}>
            <Link to={`/enciclopedia/${slug}`} className="mkt-btn mkt-btn--primary">
              Ver ficha
            </Link>
            <Link to="/setadle" className="mkt-btn mkt-btn--amber">
              Jugar Setadle
            </Link>
            <button
              type="button"
              className="mkt-btn mkt-btn--ghost"
              data-pause-toggle
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'Reanudar' : 'Pausar'}
            </button>
          </div>
        </div>
      </div>

      {/* Dense grid — each card is a mini video reel */}
      <div className="mkt-learn__grid" role="listbox" aria-label="Elegir seta para estudiar">
        {ordered.map((t, i) => {
          const selected = i === activeIdx
          return (
            <button
              key={t.taxon}
              type="button"
              role="option"
              aria-selected={selected}
              className={`mkt-learn__card ${selected ? 'is-active' : ''}`}
              onClick={() => {
                setPaused(true)
                setActiveIdx(i)
              }}
            >
              <span className="mkt-learn__card-photo">
                <MiniPhotoReel
                  taxon={t.taxon}
                  alt={t.name}
                  intervalMs={REEL_MS}
                  maxFrames={5}
                  priority={i < 6}
                  paused={paused}
                  onClickPause={() => setPaused(true)}
                />
              </span>
              <span className="mkt-learn__card-body">
                <strong>{t.name}</strong>
                <em>{t.taxon}</em>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
