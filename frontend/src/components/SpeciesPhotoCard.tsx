import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CatalogSpecies } from '../data/speciesCatalog'
import { displayCommonName } from '../data/speciesCatalog'
import { getFoodQuality } from '../lib/foodQuality'
import { SpeciesNameBlock, NO_LOCAL_COMMON_NAME } from './SpeciesNameBlock'
import { RiskChip } from './RiskChip'
import { FoodQualityChip } from './FoodQualityChip'
import {
  isTerminalMediaUrl,
  mediaStackWithTerminal,
  MEDIA_SURFACE_POLICY,
  type MediaSurface,
} from '../lib/speciesMediaStack'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'
import {
  getCatalogPhotoUrlHd,
  type PhotoDisplayQuality,
} from '../lib/speciesImageService'

export { NO_LOCAL_COMMON_NAME }

type Props = {
  species: CatalogSpecies
  /** Eager load for first grid row */
  priority?: boolean
  /**
   * Remote resize quality. Default follows encyclopedia_grid policy (`thumb`).
   * Featured / priority rows may pass `display`.
   */
  quality?: PhotoDisplayQuality
  /** Defaults to encyclopedia_grid (T1/T6). */
  surface?: MediaSurface
}

/**
 * Encyclopedia grid card — real field photos only (catalog → local).
 * Never prefers brand "Foto de campo no disponible" plates while a real URL exists.
 */
export function SpeciesPhotoCard({
  species,
  priority = false,
  quality: qualityProp,
  surface = 'encyclopedia_grid',
}: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const common = displayCommonName(species, locale)
  const food = getFoodQuality(species.taxon)
  const alt = `${common || species.taxon} — ${species.taxon}`
  const terminal = speciesPhotoErrorFallback(species.taxon, species.risk_label)
  const policy = MEDIA_SURFACE_POLICY[surface] || MEDIA_SURFACE_POLICY.encyclopedia_grid
  // Priority/first-row cards may upgrade to display for LCP; grid default is thumb.
  const quality: PhotoDisplayQuality =
    qualityProp ?? (priority ? 'display' : policy.quality)

  const stack = useMemo(
    () =>
      mediaStackWithTerminal(species.taxon, {
        // encyclopedia_grid: preferLocal + maxCandidates<=3 (audit T1)
        maxGallery: policy.maxGallery,
        includeCatalog: true,
        riskLabel: species.risk_label,
        maxCandidates: policy.maxCandidates,
        quality,
        preferLocal: policy.preferLocal,
      }),
    [species.taxon, species.risk_label, quality, policy.maxGallery, policy.maxCandidates, policy.preferLocal],
  )

  // Real candidates only (drop terminal SVG until every photo URL failed)
  const photoStack = useMemo(
    () => stack.filter((c) => !isTerminalMediaUrl(c.url)),
    [stack],
  )

  const [idx, setIdx] = useState(0)
  const [alive, setAlive] = useState(photoStack)
  const [useTerminal, setUseTerminal] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setAlive(photoStack)
    setIdx(0)
    setUseTerminal(false)
    setLoaded(false)
  }, [photoStack])

  const current = alive[idx] || alive[0]
  const src = useTerminal
    ? terminal
    : current?.url || getCatalogPhotoUrlHd(species.taxon, quality) || terminal

  const isPlate = isTerminalMediaUrl(src)

  const onError = () => {
    if (useTerminal || isPlate) return
    setLoaded(false)
    setAlive((prev) => {
      const failedUrl = current?.url
      if (!failedUrl || prev.length <= 1) {
        setUseTerminal(true)
        return prev
      }
      const next = prev.filter((c) => c.url !== failedUrl)
      setIdx(0)
      if (next.length === 0) {
        setUseTerminal(true)
        return prev
      }
      return next
    })
  }

  const onLoad = () => setLoaded(true)

  /** Cached images often skip onLoad — leave cards black forever without this. */
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (!el) return
    if (el.complete && el.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [])

  const cycleAngle = () => {
    setLoaded(false)
    setIdx((i) => (i + 1) % Math.max(alive.length, 1))
  }

  // Card shell is not a single Link: angle control must not nest interactive in <a>
  return (
    <article
      className="species-photo-card"
      data-testid="species-photo-card"
      data-taxon={species.taxon}
    >
      <div className="species-photo-card__frame">
        <Link
          to={`/enciclopedia/${species.slug}`}
          className="species-photo-card__media-link"
          aria-label={alt}
        >
          {!loaded && !isPlate ? (
            <div className="species-photo-card__shimmer" aria-hidden />
          ) : null}
          <img
            ref={imgRef}
            key={useTerminal ? `term-${src}` : current?.url || src}
            src={src}
            alt=""
            className={`species-photo-card__img${loaded || isPlate ? ' is-loaded' : ''}${isPlate ? ' is-plate' : ''}`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            width={quality === 'hd' ? 960 : quality === 'display' ? 500 : 250}
            height={quality === 'hd' ? 1200 : quality === 'display' ? 625 : 312}
            {...(priority ? ({ fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>) : {})}
            referrerPolicy="no-referrer"
            /* Half-width mobile cards @3× DPR need ~560px; display(500)/hd cover it */
            sizes="(max-width: 600px) 50vw, (max-width: 1100px) 25vw, 320px"
            onError={isPlate ? undefined : onError}
            onLoad={onLoad}
            data-media-kind={isPlate ? 'illustration' : 'photo'}
            data-photo-quality={quality}
          />
        </Link>
        <span className="species-photo-card__chips">
          {/*
            Browse cards: safety-first. Never lead with green "Comestible"
            (reads as forage OK). Show documented toxic/mortal class; else RiskChip.
          */}
          {food && (food.food_class === 'toxica' || food.food_class === 'mortal') ? (
            <FoodQualityChip foodClass={food.food_class} label={food.label} compact />
          ) : (
            <RiskChip risk={species.risk_label} />
          )}
        </span>
        {!useTerminal && !isPlate && alive.length > 1 && (
          <button
            type="button"
            className="species-photo-card__angles"
            onClick={cycleAngle}
            data-testid="species-photo-card-angles"
            aria-label={t('encyclopedia.nextPhotoAngle', {
              defaultValue: 'Siguiente ángulo de foto ({{n}} de {{total}})',
              n: idx + 1,
              total: alive.length,
            })}
          >
            {idx + 1}/{alive.length} ↻
          </button>
        )}
      </div>
      <Link to={`/enciclopedia/${species.slug}`} className="species-photo-card__body">
        <SpeciesNameBlock
          taxon={species.taxon}
          commonNames={species.common_names}
          family={species.family}
          familyEs={species.family_es}
          size="sm"
        />
      </Link>
    </article>
  )
}
