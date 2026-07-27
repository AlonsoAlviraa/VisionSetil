/**
 * Innovative multi-angle flashcard — best photos first, then gallery angles.
 * Flip to reveal name/risk. Safe image loading (referrerPolicy, cascade).
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { RiskChip } from './RiskChip'
import {
  buildSpeciesMediaStack,
  uniqueMediaStack,
  type MediaCandidate,
} from '../lib/speciesMediaStack'
import { scientificNameToSlug } from '../lib/slug'
import { riskToPlaceholder } from '../lib/edibility'

export type FlashcardSpecies = {
  taxon: string
  name: string
  risk: string
  blurb?: string
  slug?: string
}

type Props = {
  species: FlashcardSpecies
  startFlipped?: boolean
  className?: string
  compact?: boolean
  showLink?: boolean
  onFlip?: (flipped: boolean) => void
}

export function SpeciesFlashcard({
  species,
  startFlipped = false,
  className = '',
  compact = false,
  showLink = true,
  onFlip,
}: Props) {
  const slug = species.slug || scientificNameToSlug(species.taxon)
  const stack = useMemo(
    () =>
      uniqueMediaStack(
        buildSpeciesMediaStack(species.taxon, {
          maxGallery: 4,
          includeCatalog: true,
        }),
      ),
    [species.taxon],
  )

  const [alive, setAlive] = useState<MediaCandidate[]>(stack)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(startFlipped)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setAlive(stack)
    setIdx(0)
    setLoaded(false)
    setFlipped(startFlipped)
  }, [stack, startFlipped, species.taxon])

  const current = alive[idx] || alive[0]

  const dropCurrent = useCallback(() => {
    setAlive((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      setIdx(0)
      setLoaded(false)
      return next.length ? next : prev
    })
  }, [idx])

  const nextPhoto = (e?: MouseEvent) => {
    e?.stopPropagation()
    if (alive.length < 2) return
    setLoaded(false)
    setIdx((i) => (i + 1) % alive.length)
  }

  const prevPhoto = (e?: MouseEvent) => {
    e?.stopPropagation()
    if (alive.length < 2) return
    setLoaded(false)
    setIdx((i) => (i - 1 + alive.length) % alive.length)
  }

  const toggleFlip = () => {
    setFlipped((f) => {
      const n = !f
      onFlip?.(n)
      return n
    })
  }

  const riskKind = riskToPlaceholder(species.risk)

  return (
    <article
      className={`flashcard ${flipped ? 'is-flipped' : ''} ${compact ? 'flashcard--compact' : ''} ${className}`.trim()}
      data-testid="species-flashcard"
      data-taxon={species.taxon}
    >
      <div className="flashcard__inner">
        <div className="flashcard__face flashcard__face--front">
          <button
            type="button"
            className="flashcard__photo-btn"
            onClick={toggleFlip}
            aria-label={`Estudiar ${species.name}. Toca para revelar.`}
          >
            <div className="flashcard__photo-stage">
              {!loaded && <div className="flashcard__skeleton" aria-hidden />}
              {current && (
                <img
                  key={current.url}
                  src={current.url}
                  alt=""
                  className={`flashcard__img ${loaded ? 'is-loaded' : ''}`}
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  crossOrigin={current.sameOrigin ? undefined : 'anonymous'}
                  draggable={false}
                  onLoad={() => setLoaded(true)}
                  onError={dropCurrent}
                  data-media-kind={current.kind}
                />
              )}
            </div>
            <span className="flashcard__hint">Toca para revelar · cambia ángulos abajo</span>
          </button>

          {alive.length > 1 && (
            <div className="flashcard__angles" role="group" aria-label="Ángulos de la seta">
              <button type="button" className="flashcard__nav" onClick={prevPhoto} aria-label="Ángulo anterior">
                ‹
              </button>
              <div className="flashcard__dots">
                {alive.slice(0, 6).map((c, i) => (
                  <button
                    key={c.url}
                    type="button"
                    className={`flashcard__dot ${i === idx ? 'is-active' : ''}`}
                    aria-label={`Foto ${i + 1} (${c.kind})`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setLoaded(false)
                      setIdx(i)
                    }}
                  />
                ))}
              </div>
              <button type="button" className="flashcard__nav" onClick={nextPhoto} aria-label="Ángulo siguiente">
                ›
              </button>
            </div>
          )}

          <div className="flashcard__strip" aria-hidden>
            {alive.slice(0, 5).map((c, i) => (
              <button
                key={c.url + i}
                type="button"
                className={`flashcard__thumb ${i === idx ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setLoaded(false)
                  setIdx(i)
                }}
              >
                <img
                  src={c.url}
                  alt=""
                  className="flashcard__thumb-img"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={(ev) => {
                    ;(ev.currentTarget as HTMLImageElement).style.visibility = 'hidden'
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flashcard__face flashcard__face--back">
          <button type="button" className="flashcard__back-btn" onClick={toggleFlip}>
            <RiskChip risk={species.risk} />
            <h3 className="flashcard__name">{species.name}</h3>
            <em className="flashcard__taxon">{species.taxon}</em>
            {species.blurb && <p className="flashcard__blurb">{species.blurb}</p>}
            <p className="flashcard__meta">
              {alive.length} vista{alive.length === 1 ? '' : 's'} · riesgo {riskKind}
            </p>
            <span className="flashcard__hint">Toca para volver a la foto</span>
          </button>
          {showLink && slug && (
            <Link
              to={`/enciclopedia/${slug}`}
              className="flashcard__link"
              onClick={(e) => e.stopPropagation()}
            >
              Abrir ficha →
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
