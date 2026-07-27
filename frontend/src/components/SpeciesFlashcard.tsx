/**
 * Innovative multi-angle flashcard — best photos first, then gallery angles.
 * Flip to reveal name/risk. Safe image loading (referrerPolicy, cascade).
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { RiskChip } from './RiskChip'
import {
  isTerminalMediaUrl,
  mediaStackWithTerminal,
  type MediaCandidate,
} from '../lib/speciesMediaStack'
import { scientificNameToSlug } from '../lib/slug'
import { riskToPlaceholder } from '../lib/edibility'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'
import { INLINE_PLACEHOLDER_SVG } from '../lib/speciesImageUrl'

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
  const terminal = speciesPhotoErrorFallback(species.taxon, species.risk)
  const stack = useMemo(
    () =>
      mediaStackWithTerminal(species.taxon, {
        maxGallery: 4,
        includeCatalog: true,
        riskLabel: species.risk,
        maxCandidates: 6,
      }),
    [species.taxon, species.risk],
  )

  const [alive, setAlive] = useState<MediaCandidate[]>(stack)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(startFlipped)
  const [loaded, setLoaded] = useState(false)
  const [useInline, setUseInline] = useState(false)

  useEffect(() => {
    setAlive(stack)
    setIdx(0)
    setLoaded(false)
    setUseInline(false)
    setFlipped(startFlipped)
  }, [stack, startFlipped, species.taxon])

  const current = alive[idx] || alive[0]
  const photoSrc = useInline
    ? terminal || INLINE_PLACEHOLDER_SVG
    : current?.url || terminal || INLINE_PLACEHOLDER_SVG
  const terminalSrc = isTerminalMediaUrl(photoSrc)

  const dropCurrent = useCallback(() => {
    const failedUrl = current?.url
    setAlive((prev) => {
      if (!failedUrl || prev.length <= 1) {
        setUseInline(true)
        setLoaded(true)
        return prev
      }
      const next = prev.filter((c) => c.url !== failedUrl)
      setIdx(0)
      setLoaded(false)
      if (!next.length) {
        setUseInline(true)
        setLoaded(true)
        return prev
      }
      return next
    })
  }, [current?.url])

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
              {!loaded && !useInline && <div className="flashcard__skeleton" aria-hidden />}
              <img
                key={useInline ? 'inline' : current?.url || 'fb'}
                src={photoSrc}
                alt=""
                className={`flashcard__img ${loaded || useInline ? 'is-loaded' : ''}`}
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                crossOrigin={
                  !useInline && current && !current.sameOrigin && !terminalSrc
                    ? 'anonymous'
                    : undefined
                }
                draggable={false}
                onLoad={() => setLoaded(true)}
                onError={useInline || terminalSrc ? undefined : dropCurrent}
                data-media-kind={
                  useInline || terminalSrc
                    ? 'illustration'
                    : current?.kind || 'illustration'
                }
              />
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
