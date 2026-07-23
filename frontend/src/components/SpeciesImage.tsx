/**
 * SpeciesImage — always show a photo (or branded fallback).
 * Cascade: primary variant → card → thumb → risk placeholder → inline SVG.
 * layout="fill" (default): card/grid with minHeight 80.
 * layout="fixed": list thumbs — NO minHeight; parent sets box (C-06).
 */
import { useEffect, useMemo, useState, type CSSProperties, type SyntheticEvent } from 'react'
import {
  INLINE_PLACEHOLDER_SVG,
  placeholderImageUrl,
  speciesImageUrl,
  type PlaceholderKind,
  type SpeciesImageVariant,
} from '../lib/speciesImageUrl'
import { scientificNameToSlug } from '../lib/slug'
import { featureFlags } from '../lib/featureFlags'
import { ImageAttribution, type ImageAttributionMeta } from './ui/ImageAttribution'

export type SpeciesImageLayout = 'fill' | 'fixed'

export interface SpeciesImageProps {
  scientificName: string
  slug?: string
  variant?: SpeciesImageVariant
  riskLevel?: PlaceholderKind
  alt: string
  className?: string
  priority?: boolean
  sizes?: string
  aspectRatio?: string
  /** fill = card/grid (default): minHeight 80 OK. fixed = list thumbs: NO minHeight; parent sets box. */
  layout?: SpeciesImageLayout
  width?: number
  height?: number
  lqip?: boolean
  /** If naturalWidth < min (default 8) → treat as error, advance cascade. Does NOT detect solid stubs. */
  minNaturalWidth?: number
  showAttribution?: boolean
  attribution?: ImageAttributionMeta | null
  onStageChange?: (stage: string) => void
}

function riskFromProps(riskLevel?: PlaceholderKind): PlaceholderKind {
  if (!riskLevel) return 'default'
  if (['default', 'toxic', 'deadly', 'unknown'].includes(riskLevel)) return riskLevel
  return 'default'
}

type Stage = 'primary' | 'card' | 'thumb' | 'placeholder' | 'inline'

function urlForStage(
  slug: string,
  variant: SpeciesImageVariant,
  stage: Stage,
  kind: PlaceholderKind,
): string {
  switch (stage) {
    case 'primary':
      return speciesImageUrl(slug, variant)
    case 'card':
      return speciesImageUrl(slug, 'card')
    case 'thumb':
      return speciesImageUrl(slug, 'thumb')
    case 'placeholder':
      return placeholderImageUrl(kind)
    case 'inline':
    default:
      return INLINE_PLACEHOLDER_SVG
  }
}

export function SpeciesImage({
  scientificName,
  slug: slugProp,
  variant = 'card',
  riskLevel,
  alt,
  className = '',
  priority = false,
  sizes,
  aspectRatio,
  layout = 'fill',
  width,
  height,
  minNaturalWidth = 8,
  showAttribution = false,
  attribution = null,
  onStageChange,
}: SpeciesImageProps) {
  const slug = (slugProp || scientificNameToSlug(scientificName) || '').toLowerCase()
  const kind = riskFromProps(riskLevel)
  const mediaOn = featureFlags.SPECIES_MEDIA && Boolean(slug)

  const initialStage: Stage = mediaOn ? 'primary' : 'inline'
  const [stage, setStage] = useState<Stage>(initialStage)
  const [src, setSrc] = useState(() =>
    mediaOn ? urlForStage(slug, variant, 'primary', kind) : INLINE_PLACEHOLDER_SVG,
  )
  const [loaded, setLoaded] = useState(false)

  // Reset on species change
  useEffect(() => {
    if (!mediaOn) {
      setStage('inline')
      setSrc(INLINE_PLACEHOLDER_SVG)
      setLoaded(true)
      onStageChange?.('inline')
      return
    }
    setStage('primary')
    setSrc(urlForStage(slug, variant, 'primary', kind))
    setLoaded(false)
    onStageChange?.('primary')
  }, [slug, variant, kind, mediaOn]) // eslint-disable-line react-hooks/exhaustive-deps

  const advanceFrom = (current: Stage) => {
    const order: Stage[] =
      variant === 'card'
        ? ['primary', 'thumb', 'placeholder', 'inline']
        : variant === 'thumb'
          ? ['primary', 'card', 'placeholder', 'inline']
          : ['primary', 'card', 'thumb', 'placeholder', 'inline']

    const idx = order.indexOf(current)
    let next = order[idx + 1] || 'inline'
    // skip duplicate primary→card when already on card
    if (next === 'card' && variant === 'card') {
      next = 'thumb'
    }
    if (next === 'primary') {
      next = 'card'
    }
    setStage(next)
    setSrc(urlForStage(slug, variant, next, kind))
    setLoaded(next === 'inline')
    onStageChange?.(next)
  }

  const handleError = () => advanceFrom(stage)

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    // Client last-line only: zero-dim / tiny naturalWidth (NOT solid-color full-dim stubs — C-04/C-05)
    // naturalWidth === 0 counts as failure (broken decode) — Issue 2
    if (
      minNaturalWidth > 0 &&
      stage !== 'inline' &&
      stage !== 'placeholder' &&
      (img.naturalWidth < minNaturalWidth || img.naturalHeight < 1)
    ) {
      advanceFrom(stage)
      return
    }
    setLoaded(true)
  }

  const style = useMemo(
    () => ({
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      display: 'block',
      background: 'linear-gradient(135deg, #2d4a2b, #3a5a40)',
    }),
    [],
  )

  const wrapperStyle: CSSProperties =
    layout === 'fixed'
      ? {
          position: 'relative',
          width: width ?? '100%',
          height: height ?? '100%',
          minHeight: 0,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #dfe8df, #c5d4c5)',
          aspectRatio: aspectRatio,
        }
      : {
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 80,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #dfe8df, #c5d4c5)',
          aspectRatio: aspectRatio,
        }

  return (
    <div
      className={`species-image ${className}`.trim()}
      data-testid="species-image"
      data-slug={slug}
      data-stage={stage}
      data-layout={layout}
      style={wrapperStyle}
    >
      {!loaded && stage !== 'inline' ? (
        <div
          className="species-image__skeleton"
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, #d0dcd0 25%, #e8f0e8 50%, #d0dcd0 75%)',
            backgroundSize: '200% 100%',
            animation: 'species-shimmer 1.2s ease-in-out infinite',
          }}
        />
      ) : null}
      <img
        key={`${slug}-${variant}-${stage}`}
        src={src}
        alt={alt}
        className={`species-image__img ${loaded ? 'species-image__img--loaded' : 'species-image__img--loading'}`}
        style={style}
        sizes={sizes}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={handleError}
        onLoad={handleLoad}
        data-slug={slug}
        data-stage={stage}
      />
      {showAttribution && stage !== 'inline' && stage !== 'placeholder' ? (
        <ImageAttribution meta={attribution} />
      ) : null}
    </div>
  )
}
