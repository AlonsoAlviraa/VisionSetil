/**
 * Real-photo 360° product spin — drag through actual field photographs.
 * Sources: catalog + iNaturalist. No fake 3D geometry.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  frameIndexFromDrag,
  nextFrameIndex,
  preloadImages,
  resolveSpinPhotoSet,
  type SpinPhoto,
  type SpinPhotoSet,
} from '../lib/realPhotoSpin'
import { mycologyPlaceholderDataUri } from '../data/mycologyPlaceholder'

export type PhotoSpinViewerProps = {
  taxon: string
  height?: number
  autoPlay?: boolean
  className?: string
  label?: string
  riskLabel?: string
}

export function PhotoSpinViewer({
  taxon,
  height = 400,
  autoPlay = true,
  className = '',
  label,
  riskLabel,
}: PhotoSpinViewerProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [set, setSet] = useState<SpinPhotoSet | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(autoPlay)
  const [hint, setHint] = useState(true)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startIndex: 0 })

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setIndex(0)
    void resolveSpinPhotoSet(taxon).then(async (s) => {
      if (cancelled) return
      setSet(s)
      await preloadImages(s.frames.map((f) => f.url))
      if (cancelled) return
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [taxon])

  // Autoplay — very slow product turntable (fichas / detalle)
  useEffect(() => {
    if (reduced || !playing || !set?.canSpin || dragging) return
    // ~1100ms/frame ≈ 7–9s por vuelta con 6–8 ángulos
    const id = window.setInterval(() => {
      setIndex((i) => nextFrameIndex(i, set.frames.length, 1))
    }, 1100)
    return () => clearInterval(id)
  }, [playing, set, dragging, reduced])

  const frame: SpinPhoto | null = set?.frames[index] ?? null
  const placeholder = mycologyPlaceholderDataUri(taxon, riskLabel)
  const displayUrl = frame?.url || placeholder
  const canSpin = Boolean(set?.canSpin)
  const count = set?.frames.length ?? 0

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canSpin) return
      dragRef.current = { active: true, startX: e.clientX, startIndex: index }
      setDragging(true)
      setHint(false)
      setPlaying(false)
      stageRef.current?.setPointerCapture(e.pointerId)
    },
    [canSpin, index],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active || !set?.canSpin) return
      const dx = e.clientX - dragRef.current.startX
      // pixelsPerFrame higher = drag needs more travel = feels slower / calmer
      const next = frameIndexFromDrag(dragRef.current.startIndex, dx, set.frames.length, 48)
      setIndex(next)
    },
    [set],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false
    setDragging(false)
    try {
      stageRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const go = (dir: number) => {
    if (!set?.canSpin) return
    setHint(false)
    setPlaying(false)
    setIndex((i) => nextFrameIndex(i, set.frames.length, dir))
  }

  const title = label || `Fotos reales de ${taxon}`

  return (
    <div className={`photo-spin ${className}`.trim()}>
      <div
        ref={stageRef}
        className={`photo-spin__stage ${dragging ? 'is-dragging' : ''} ${canSpin ? 'can-spin' : ''}`}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={
          canSpin
            ? `${title}. ${count} fotos reales. Arrastra para girar entre ángulos de campo.`
            : `${title}. Foto real de campo.`
        }
      >
        {loading && (
          <div className="photo-spin__loading" aria-live="polite">
            Cargando fotos reales…
          </div>
        )}
        <img
          key={displayUrl}
          src={displayUrl}
          alt={`${taxon} — vista ${index + 1}${count ? ` de ${count}` : ''}`}
          className="photo-spin__img"
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget
            if (img.src !== placeholder) img.src = placeholder
          }}
        />

        <div className="photo-spin__veil" aria-hidden="true" />

        {hint && canSpin && (
          <div className="photo-spin__hint">
            <span className="photo-spin__hint-pill">Arrastra</span>
          </div>
        )}

        {canSpin && (
          <div className="photo-spin__progress" aria-hidden="true">
            <div
              className="photo-spin__progress-fill"
              style={{ width: `${((index + 1) / count) * 100}%` }}
            />
          </div>
        )}

        <div className="photo-spin__badge" aria-live="polite">
          <span className="photo-spin__angle">
            {canSpin ? `${index + 1} / ${count}` : loading ? '…' : '1 / 1'}
          </span>
        </div>
      </div>

      <div className="photo-spin__chrome">
        <div className="photo-spin__controls">
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost"
            disabled={!canSpin}
            onClick={() => go(-1)}
            aria-label="Ángulo anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn-atelier btn-atelier--primary"
            disabled={!canSpin}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? 'Pausar' : 'Girar'}
          </button>
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost"
            disabled={!canSpin}
            onClick={() => go(1)}
            aria-label="Ángulo siguiente"
          >
            ›
          </button>
        </div>
        {frame?.attribution && (
          <p className="photo-spin__attr">Crédito: {frame.attribution}</p>
        )}
      </div>
    </div>
  )
}

export default PhotoSpinViewer
