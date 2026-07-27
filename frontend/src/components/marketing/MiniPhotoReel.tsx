/**
 * Mini photo reel — cycles stack every intervalMs (default 3s), like a silent clip.
 * Only used on learn flashcards, not site-wide.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  buildSpeciesMediaStack,
  uniqueMediaStack,
} from '../../lib/speciesMediaStack'

type Props = {
  taxon: string
  alt: string
  intervalMs?: number
  maxFrames?: number
  className?: string
  priority?: boolean
  paused?: boolean
  /** Parent can stop the whole gallery when a reel is clicked */
  onClickPause?: () => void
}

export function MiniPhotoReel({
  taxon,
  alt,
  intervalMs = 1500,
  maxFrames = 5,
  className = '',
  priority = false,
  paused = false,
  onClickPause,
}: Props) {
  const stack = useMemo(
    () =>
      uniqueMediaStack(
        buildSpeciesMediaStack(taxon, { maxGallery: 4, includeCatalog: true }),
      ).slice(0, maxFrames),
    [taxon, maxFrames],
  )

  const [alive, setAlive] = useState(stack)
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    setAlive(stack)
    setIdx(0)
    setFade(true)
  }, [stack])

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (paused || reduced || alive.length < 2) return
    const t = window.setInterval(() => {
      setFade(false)
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % alive.length)
        setFade(true)
      }, 180)
    }, intervalMs)
    return () => window.clearInterval(t)
  }, [alive.length, intervalMs, paused, reduced])

  const current = alive[idx] || alive[0]
  if (!current) {
    return <div className={`mini-reel mini-reel--empty ${className}`.trim()} aria-hidden />
  }

  return (
    <div
      className={`mini-reel ${className}`.trim()}
      data-testid="mini-photo-reel"
      onClick={(e) => {
        e.stopPropagation()
        onClickPause?.()
      }}
    >
      <img
        key={current.url}
        src={current.url}
        alt={alt}
        className={`mini-reel__img ${fade ? 'is-in' : 'is-out'}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin={current.sameOrigin ? undefined : 'anonymous'}
        draggable={false}
        onError={() => {
          setAlive((prev) => {
            if (prev.length <= 1) return prev
            const next = prev.filter((_, i) => i !== idx)
            setIdx(0)
            return next
          })
        }}
      />
      {alive.length > 1 && (
        <span className="mini-reel__badge" aria-hidden>
          {paused ? '❚❚' : `${idx + 1}/${alive.length}`}
        </span>
      )}
    </div>
  )
}
