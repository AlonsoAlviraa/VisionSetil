/**
 * SpeciesImage — always show a photo (or branded fallback).
 * Cascade: primary variant → card → thumb → risk placeholder → inline SVG.
 */
import { useEffect, useMemo, useState } from 'react'
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

export interface SpeciesImageProps {
  scientificName: string
  slug?: string
  variant?: SpeciesImageVariant
  riskLevel?: PlaceholderKind
  alt: string
  className?: string
  priority?: boolean
  showAttribution?: boolean
  attribution?: ImageAttributionMeta | null
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
  showAttribution = false,
  attribution = null,
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
      return
    }
    setStage('primary')
    setSrc(urlForStage(slug, variant, 'primary', kind))
    setLoaded(false)
  }, [slug, variant, kind, mediaOn])

  const handleError = () => {
    const order: Stage[] =
      variant === 'card'
        ? ['primary', 'thumb', 'placeholder', 'inline']
        : variant === 'thumb'
          ? ['primary', 'card', 'placeholder', 'inline']
          : ['primary', 'card', 'thumb', 'placeholder', 'inline']

    const idx = order.indexOf(stage)
    const next = order[idx + 1] || 'inline'
    // skip duplicate primary→card when already on card
    if (next === 'card' && variant === 'card') {
      setStage('thumb')
      setSrc(urlForStage(slug, variant, 'thumb', kind))
      setLoaded(false)
      return
    }
    if (next === 'primary') {
      setStage('card')
      setSrc(urlForStage(slug, variant, 'card', kind))
      setLoaded(false)
      return
    }
    setStage(next)
    setSrc(urlForStage(slug, variant, next, kind))
    setLoaded(next === 'inline')
  }

  const handleLoad = () => setLoaded(true)

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

  return (
    <div
      className={`species-image ${className}`.trim()}
      data-testid="species-image"
      data-slug={slug}
      data-stage={stage}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 80,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #dfe8df, #c5d4c5)',
      }}
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
