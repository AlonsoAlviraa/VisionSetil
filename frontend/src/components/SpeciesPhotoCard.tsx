import { useEffect, useMemo, useState } from 'react'
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
} from '../lib/speciesMediaStack'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'
import { getCatalogPhotoUrlHd } from '../lib/speciesImageService'

export { NO_LOCAL_COMMON_NAME }

type Props = {
  species: CatalogSpecies
  /** Eager load for first grid row */
  priority?: boolean
}

/**
 * Encyclopedia grid card — real field photos only (catalog → local).
 * Never prefers brand "Foto de campo no disponible" plates while a real URL exists.
 */
export function SpeciesPhotoCard({ species, priority = false }: Props) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const common = displayCommonName(species, locale)
  const food = getFoodQuality(species.taxon)
  const alt = `${common || species.taxon} — ${species.taxon}`
  const terminal = speciesPhotoErrorFallback(species.taxon, species.risk_label)

  const stack = useMemo(
    () =>
      mediaStackWithTerminal(species.taxon, {
        maxGallery: 2,
        includeCatalog: true,
        riskLabel: species.risk_label,
        maxCandidates: 6,
        quality: 'display',
      }),
    [species.taxon, species.risk_label],
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
    ? // Last resort only: if catalog has any URL, force it once more before plate
      getCatalogPhotoUrlHd(species.taxon, 'display') ||
      getCatalogPhotoUrlHd(species.taxon, 'thumb') ||
      terminal
    : current?.url ||
      getCatalogPhotoUrlHd(species.taxon, 'display') ||
      terminal

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

  return (
    <Link to={`/enciclopedia/${species.slug}`} className="species-photo-card">
      <div className="species-photo-card__frame">
        {!loaded && !isPlate ? (
          <div className="species-photo-card__shimmer" aria-hidden />
        ) : null}
        <img
          key={useTerminal ? `term-${src}` : current?.url || src}
          src={src}
          alt={alt}
          className={`species-photo-card__img${loaded ? ' is-loaded' : ''}${isPlate ? ' is-plate' : ''}`}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          referrerPolicy="no-referrer"
          sizes="(max-width: 600px) 48vw, (max-width: 1100px) 22vw, 260px"
          onError={isPlate ? undefined : onError}
          onLoad={onLoad}
          data-media-kind={isPlate ? 'illustration' : 'photo'}
        />
        <span className="species-photo-card__chips">
          {food ? (
            <FoodQualityChip foodClass={food.food_class} label={food.label} compact />
          ) : (
            <RiskChip risk={species.risk_label} />
          )}
        </span>
        {!useTerminal && !isPlate && alive.length > 1 && (
          <span
            className="species-photo-card__angles"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setLoaded(false)
              setIdx((i) => (i + 1) % alive.length)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setLoaded(false)
                setIdx((i) => (i + 1) % alive.length)
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Siguiente ángulo de foto"
          >
            {idx + 1}/{alive.length} ↻
          </span>
        )}
      </div>
      <div className="species-photo-card__body">
        <SpeciesNameBlock
          taxon={species.taxon}
          commonNames={species.common_names}
          family={species.family}
          familyEs={species.family_es}
          size="sm"
        />
      </div>
    </Link>
  )
}
