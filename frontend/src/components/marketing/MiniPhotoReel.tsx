/**
 * Mini photo reel — cycles stack every intervalMs (default 3s), like a silent clip.
 * Only used on learn flashcards, not site-wide.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  isTerminalMediaUrl,
  mediaStackWithTerminal,
} from '../../lib/speciesMediaStack'
import { speciesPhotoErrorFallback } from '../../lib/speciesPhotoFallback'
import { INLINE_PLACEHOLDER_SVG } from '../../lib/speciesImageUrl'

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
  riskLabel?: string | null
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
  riskLabel,
}: Props) {
  const terminal = speciesPhotoErrorFallback(taxon, riskLabel)
  // maxCandidates = maxFrames - 1 so terminal always fits after slice
  const stack = useMemo(
    () =>
      mediaStackWithTerminal(taxon, {
        maxGallery: 4,
        includeCatalog: true,
        riskLabel,
        maxCandidates: Math.max(1, maxFrames - 1),
      }),
    [taxon, maxFrames, riskLabel],
  )

  const [alive, setAlive] = useState(stack)
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const [useInline, setUseInline] = useState(false)

  useEffect(() => {
    setAlive(stack)
    setIdx(0)
    setFade(true)
    setUseInline(false)
  }, [stack])

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (paused || reduced || useInline || alive.length < 2) return
    let fadeTimer: number | undefined
    const t = window.setInterval(() => {
      setFade(false)
      fadeTimer = window.setTimeout(() => {
        setIdx((i) => (i + 1) % alive.length)
        setFade(true)
      }, 180)
    }, intervalMs)
    return () => {
      window.clearInterval(t)
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer)
    }
  }, [alive.length, intervalMs, paused, reduced, useInline])

  const current = alive[idx] || alive[0]
  const src = useInline
    ? terminal || INLINE_PLACEHOLDER_SVG
    : current?.url || terminal || INLINE_PLACEHOLDER_SVG
  const terminalSrc = isTerminalMediaUrl(src)

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
        key={useInline ? 'inline' : current?.url || 'fb'}
        src={src}
        alt={alt}
        className={`mini-reel__img ${fade ? 'is-in' : 'is-out'}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin={
          !useInline && current && !current.sameOrigin && !terminalSrc
            ? 'anonymous'
            : undefined
        }
        draggable={false}
        onError={
          useInline || terminalSrc
            ? undefined
            : () => {
                const failedUrl = current?.url
                setAlive((prev) => {
                  if (!failedUrl || prev.length <= 1) {
                    setUseInline(true)
                    return prev
                  }
                  const next = prev.filter((c) => c.url !== failedUrl)
                  setIdx(0)
                  if (next.length === 0) {
                    setUseInline(true)
                    return prev
                  }
                  return next
                })
              }
        }
      />
      {!useInline && alive.length > 1 && (
        <span className="mini-reel__badge" aria-hidden>
          {paused ? '❚❚' : `${idx + 1}/${alive.length}`}
        </span>
      )}
    </div>
  )
}
