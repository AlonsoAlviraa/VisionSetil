import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogSpecies } from '../data/speciesCatalog'
import { getFoodQuality } from '../lib/foodQuality'
import { SpeciesNameBlock, NO_LOCAL_COMMON_NAME } from './SpeciesNameBlock'
import { RiskChip } from './RiskChip'
import { FoodQualityChip } from './FoodQualityChip'
import {
  buildSpeciesMediaStack,
  uniqueMediaStack,
} from '../lib/speciesMediaStack'

export { NO_LOCAL_COMMON_NAME }

type Props = {
  species: CatalogSpecies
  /** Eager load for first grid row */
  priority?: boolean
}

/**
 * Encyclopedia grid card — multi-angle when available (best photo first).
 * Safe loads: referrerPolicy no-referrer, cascade on error.
 */
export function SpeciesPhotoCard({ species, priority = false }: Props) {
  const common = species.common_names[0]?.trim()
  const food = getFoodQuality(species.taxon)
  const alt = `${common || NO_LOCAL_COMMON_NAME} — ${species.taxon}`

  const stack = useMemo(
    () =>
      uniqueMediaStack(
        buildSpeciesMediaStack(species.taxon, {
          maxGallery: 3,
          includeCatalog: true,
        }),
      ).slice(0, 4),
    [species.taxon],
  )

  const [idx, setIdx] = useState(0)
  const [alive, setAlive] = useState(stack)
  const current = alive[idx] || alive[0]

  useEffect(() => {
    setAlive(stack)
    setIdx(0)
  }, [stack])

  const onError = () => {
    setAlive((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      setIdx(0)
      return next
    })
  }

  return (
    <Link to={`/enciclopedia/${species.slug}`} className="species-photo-card">
      <div className="species-photo-card__frame" style={{ aspectRatio: '1/1', overflow: 'hidden' }}>
        {current ? (
          <img
            key={current.url}
            src={current.url}
            alt={alt}
            className="species-photo-card__img"
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            crossOrigin={current.sameOrigin ? undefined : 'anonymous'}
            sizes="(max-width: 600px) 45vw, 220px"
            onError={onError}
            data-media-kind={current.kind}
          />
        ) : (
          <div className="species-photo-card__fallback" aria-hidden />
        )}
        <span className="species-photo-card__chips">
          {food ? (
            <FoodQualityChip foodClass={food.food_class} label={food.label} compact />
          ) : (
            <RiskChip risk={species.risk_label} />
          )}
        </span>
        {alive.length > 1 && (
          <span
            className="species-photo-card__angles"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIdx((i) => (i + 1) % alive.length)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
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
