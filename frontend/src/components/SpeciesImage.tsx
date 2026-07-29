/**
 * SpeciesImage — always show a photo (or branded fallback).
 * Cascade: catalog HD → local variant → card → thumb → risk placeholder → inline SVG.
 * Prefers real catalog photos (iNat/Wiki HD) because many local cards are stubs.
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
import {
  isIllustrationMedia,
  mediaBadgeLabel,
  shouldShowMediaBadge,
} from '../lib/mediaBadge'
import {
  getCatalogPhotoUrlHd,
  qualityForVariant,
  type PhotoDisplayQuality,
} from '../lib/speciesImageService'
import { warmImageUrl } from '../lib/imageWarm'
import { ImageAttribution, type ImageAttributionMeta } from './ui/ImageAttribution'

export type SpeciesImageLayout = 'fill' | 'fixed'

export interface SpeciesImageProps {
  scientificName: string
  slug?: string
  variant?: SpeciesImageVariant
  riskLevel?: PlaceholderKind
  alt: string
  className?: string
  /** Eager + high fetch priority (LCP / above-the-fold). */
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
  /**
   * Phase D-05: honest media chrome.
   * - "auto": badge only when fallback (placeholder/inline) → "Ilustración"
   * - "always": also show "Foto" on real cascade stages
   * - false: off (default)
   */
  showMediaBadge?: boolean | 'auto' | 'always'
  /** Optional external KPI status from season pack / audit */
  mediaStatus?: string | null
  /**
   * Prefer remote catalog before local /media (default true).
   * Set false only for offline-pack pure same-origin demos.
   */
  preferCatalog?: boolean
  /**
   * Remote resize quality. Default from variant:
   * thumb/card → thumb (250px wiki / small iNat), detail → display (500), hero → hd.
   */
  quality?: PhotoDisplayQuality
}

function riskFromProps(riskLevel?: PlaceholderKind): PlaceholderKind {
  if (!riskLevel) return 'default'
  if (['default', 'toxic', 'deadly', 'unknown'].includes(riskLevel)) return riskLevel
  return 'default'
}

type Stage = 'catalog' | 'primary' | 'card' | 'thumb' | 'placeholder' | 'inline'

function stageOrder(
  variant: SpeciesImageVariant,
  hasCatalog: boolean,
  preferCatalog: boolean,
): Stage[] {
  const localFirst: Stage[] =
    variant === 'card'
      ? ['primary', 'thumb', 'placeholder', 'inline']
      : variant === 'thumb'
        ? ['primary', 'card', 'placeholder', 'inline']
        : ['primary', 'card', 'thumb', 'placeholder', 'inline']

  if (!hasCatalog) return localFirst

  // detail (hero/ficha): remote catalog first for max resolution when requested.
  // card/thumb grids: same-origin /media first — 520 real webps, no Commons 400/429,
  // then catalog as upgrade. Avoids "Sin foto real" when remote fails first paint.
  if (preferCatalog && variant === 'detail') {
    return ['catalog', ...localFirst]
  }
  const out = [...localFirst]
  const pi = out.indexOf('placeholder')
  if (pi >= 0) out.splice(pi, 0, 'catalog')
  else out.push('catalog')
  return out
}

function urlForStage(
  slug: string,
  variant: SpeciesImageVariant,
  stage: Stage,
  kind: PlaceholderKind,
  catalogUrl: string | null,
): string {
  switch (stage) {
    case 'catalog':
      return catalogUrl || INLINE_PLACEHOLDER_SVG
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
  minNaturalWidth = 32,
  showAttribution = false,
  attribution = null,
  onStageChange,
  showMediaBadge = false,
  mediaStatus = null,
  preferCatalog = true,
  quality: qualityProp,
}: SpeciesImageProps) {
  const slug = (slugProp || scientificNameToSlug(scientificName) || '').toLowerCase()
  const kind = riskFromProps(riskLevel)
  const mediaOn = featureFlags.SPECIES_MEDIA && Boolean(slug)
  const quality = qualityProp ?? qualityForVariant(variant)
  // Sized remote with Commons-allowlisted px (250/500/1280 — never 320/640)
  const catalogUrl = useMemo(
    () => (preferCatalog ? getCatalogPhotoUrlHd(scientificName, quality) : null),
    [scientificName, preferCatalog, quality],
  )
  const hasCatalog = Boolean(catalogUrl)
  const order = useMemo(
    () => stageOrder(variant, hasCatalog, preferCatalog),
    [variant, hasCatalog, preferCatalog],
  )

  const initialStage: Stage = mediaOn ? order[0] : 'inline'
  const [stage, setStage] = useState<Stage>(initialStage)
  const [src, setSrc] = useState(() =>
    mediaOn ? urlForStage(slug, variant, order[0], kind, catalogUrl) : INLINE_PLACEHOLDER_SVG,
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
    const start = order[0]
    const nextSrc = urlForStage(slug, variant, start, kind, catalogUrl)
    setStage(start)
    setSrc(nextSrc)
    setLoaded(false)
    onStageChange?.(start)
    // Warm next-candidate local path only after catalog (low priority)
    if (priority && nextSrc) warmImageUrl(nextSrc)
  }, [slug, variant, kind, mediaOn, catalogUrl, order, priority]) // eslint-disable-line react-hooks/exhaustive-deps

  const advanceFrom = (current: Stage) => {
    const idx = order.indexOf(current)
    let next = order[idx + 1] || 'inline'
    // skip empty catalog
    if (next === 'catalog' && !catalogUrl) {
      next = order[order.indexOf('catalog') + 1] || 'inline'
    }
    // skip duplicate primary→card when already on card variant
    if (next === 'card' && variant === 'card' && current !== 'catalog') {
      const after = order.indexOf(next)
      next = order[after + 1] || 'inline'
    }
    setStage(next)
    setSrc(urlForStage(slug, variant, next, kind, catalogUrl))
    setLoaded(next === 'inline')
    onStageChange?.(next)
  }

  const handleError = () => advanceFrom(stage)

  const markLoaded = (img: HTMLImageElement) => {
    if (
      minNaturalWidth > 0 &&
      stage !== 'inline' &&
      stage !== 'placeholder' &&
      (img.naturalWidth < minNaturalWidth || img.naturalHeight < 1)
    ) {
      advanceFrom(stage)
      return
    }
    // Tiny decoded images (often stub placeholders) → keep cascading when catalog available
    if (
      stage !== 'inline' &&
      stage !== 'placeholder' &&
      stage !== 'catalog' &&
      catalogUrl &&
      img.naturalWidth > 0 &&
      img.naturalWidth < 96 &&
      img.naturalHeight < 96
    ) {
      advanceFrom(stage)
      return
    }
    setLoaded(true)
  }

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    markLoaded(e.currentTarget)
  }

  /** Cached images may complete before onLoad attaches — paint immediately. */
  const imgRefCallback = (node: HTMLImageElement | null) => {
    if (!node || loaded) return
    if (node.complete && node.naturalWidth > 0) {
      markLoaded(node)
    }
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
          background: 'linear-gradient(135deg, #1a221b, #243028)',
          aspectRatio: aspectRatio,
        }
      : {
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 80,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #1a221b, #243028)',
          aspectRatio: aspectRatio,
        }

  const isIllustration = isIllustrationMedia(stage, mediaStatus)
  const badgeMode = showMediaBadge === true ? 'auto' : showMediaBadge
  const showBadge = shouldShowMediaBadge(badgeMode, isIllustration, loaded)
  const badgeLabel = mediaBadgeLabel(stage, mediaStatus)

  return (
    <div
      className={`species-image ${className}`.trim()}
      data-testid="species-image"
      data-slug={slug}
      data-stage={stage}
      data-layout={layout}
      data-media-kind={isIllustration ? 'illustration' : 'photo'}
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
              'linear-gradient(90deg, #1c241d 25%, #2a342c 50%, #1c241d 75%)',
            backgroundSize: '200% 100%',
            animation: 'species-shimmer 1.2s ease-in-out infinite',
          }}
        />
      ) : null}
      <img
        key={`${slug}-${variant}-${stage}-${quality}`}
        ref={imgRefCallback}
        src={src}
        alt={alt}
        className={`species-image__img ${loaded ? 'species-image__img--loaded' : 'species-image__img--loading'}`}
        style={style}
        sizes={
          sizes ||
          (priority
            ? '100vw'
            : variant === 'thumb'
              ? '(max-width: 600px) 30vw, 120px'
              : '(max-width: 600px) 45vw, 220px')
        }
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        // no-referrer helps privacy; do NOT set crossOrigin=anonymous —
        // Wikimedia often lacks CORS headers and then <img> fails to paint.
        referrerPolicy="no-referrer"
        onError={handleError}
        onLoad={handleLoad}
        data-slug={slug}
        data-stage={stage}
        data-quality={quality}
      />
      {showBadge ? (
        <span
          className={`species-image__media-badge species-image__media-badge--${isIllustration ? 'illustration' : 'photo'}`}
          data-testid="species-media-badge"
        >
          {badgeLabel}
        </span>
      ) : null}
      {showAttribution && stage !== 'inline' && stage !== 'placeholder' ? (
        <ImageAttribution meta={attribution} />
      ) : null}
    </div>
  )
}
