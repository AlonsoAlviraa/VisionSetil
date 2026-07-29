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
import { INLINE_PLACEHOLDER_SVG } from '../lib/speciesImageUrl'

export { NO_LOCAL_COMMON_NAME }

type Props = {
  species: CatalogSpecies
  /** Eager load for first grid row */
  priority?: boolean
}

/**
 * Encyclopedia grid card — multi-angle when available (best photo first).
 * Safe loads: referrerPolicy no-referrer, cascade on error by URL → SVG terminal.
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
        maxGallery: 3,
        includeCatalog: true,
        riskLabel: species.risk_label,
        maxCandidates: 4,
        // Encyclopedia grid: small remotes (320/small) so cards paint fast
        quality: 'thumb',
      }),
    [species.taxon, species.risk_label],
  )

  const [idx, setIdx] = useState(0)
  const [alive, setAlive] = useState(stack)
  const [useInline, setUseInline] = useState(false)
  const current = alive[idx] || alive[0]

  useEffect(() => {
    setAlive(stack)
    setIdx(0)
    setUseInline(false)
  }, [stack])

  const onError = () => {
    const failedUrl = current?.url
    setAlive((prev) => {
      if (!failedUrl || prev.length <= 1) {
        setUseInline(true)
        return prev
      }
      const next = prev.filter((c) => c.url !== failedUrl)
      setIdx(0)
      if (next.length === 0 || next.every((c) => isTerminalMediaUrl(c.url))) {
        // still try remaining terminal frames; if only terminal left, show it once
        if (next.length === 0) {
          setUseInline(true)
          return prev
        }
      }
      return next
    })
  }

  const src = useInline
    ? terminal || INLINE_PLACEHOLDER_SVG
    : current?.url || terminal || INLINE_PLACEHOLDER_SVG
  const terminalSrc = isTerminalMediaUrl(src)

  return (
    <Link to={`/enciclopedia/${species.slug}`} className="species-photo-card">
      <div className="species-photo-card__frame" style={{ aspectRatio: '1/1', overflow: 'hidden' }}>
        <img
          key={useInline ? 'inline' : current?.url || 'fb'}
          src={src}
          alt={alt}
          className="species-photo-card__img"
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          referrerPolicy="no-referrer"
          sizes="(max-width: 600px) 45vw, 200px"
          onError={useInline || terminalSrc ? undefined : onError}
          data-media-kind={
            useInline || terminalSrc ? 'illustration' : current?.kind || 'illustration'
          }
        />
        <span className="species-photo-card__chips">
          {food ? (
            <FoodQualityChip foodClass={food.food_class} label={food.label} compact />
          ) : (
            <RiskChip risk={species.risk_label} />
          )}
        </span>
        {!useInline && alive.length > 1 && (
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
