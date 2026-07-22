/** Reusable card for displaying a mushroom species with reliable SpeciesImage. */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MushroomSpecies } from '../data/mushroomDatabase'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { EDIBILITY_COLORS_D16, riskToPlaceholder } from '../lib/edibility'
import { featureFlags } from '../lib/featureFlags'
import { isFavorite, toggleFavorite } from '../lib/favorites'
import { useState } from 'react'

interface MushroomCardProps {
  species: MushroomSpecies
  slug?: string
  riskLevel?: string
}

export function MushroomCard({ species, slug: slugProp, riskLevel }: MushroomCardProps) {
  const { t } = useTranslation()
  const slug = slugProp || species.slug || scientificNameToSlug(species.scientificName)
  const [fav, setFav] = useState(() => isFavorite(slug))
  const color =
    EDIBILITY_COLORS_D16[species.edibility as keyof typeof EDIBILITY_COLORS_D16] ||
    EDIBILITY_COLORS_D16.desconocido
  const label = t(`edibility.${species.edibility}`, {
    defaultValue: species.edibility,
  })
  const alt = `${species.commonNames[0] || species.scientificName} (${species.scientificName})`
  const risk = riskLevel || species.riskLevel

  return (
    <div className="mushroom-card card-3d-tilt card-glow" style={{ position: 'relative' }}>
      {featureFlags.FAVORITES ? (
        <button
          type="button"
          className="fav-toggle"
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}
          aria-pressed={fav}
          aria-label={fav ? t('actions.unfavorite') : t('actions.favorite')}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setFav(toggleFavorite(slug))
          }}
        >
          {fav ? '★' : '☆'}
        </button>
      ) : null}
      <Link to={`/enciclopedia/${slug}`} className="mushroom-card-link" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="mushroom-card-image">
          <SpeciesImage
            key={slug}
            scientificName={species.scientificName}
            slug={slug}
            variant="card"
            riskLevel={riskToPlaceholder(risk, species.edibility)}
            alt={alt}
            className="mushroom-card-species-image"
          />
          <span className="mushroom-card-badge" style={{ backgroundColor: color }}>
            {label}
          </span>
        </div>
        <div className="mushroom-card-body">
          <h3 className="mushroom-card-name">
            {species.commonNames[0] || <em>{species.scientificName}</em>}
          </h3>
          <p className="mushroom-card-scientific">
            <em>{species.scientificName}</em>
          </p>
          <p className="mushroom-card-tagline">{species.tagline}</p>
          <div className="mushroom-card-meta">
            <span className="meta-chip">📅 {species.season}</span>
            <span className="meta-chip">🌳 {species.family}</span>
          </div>
        </div>
      </Link>
    </div>
  )
}
