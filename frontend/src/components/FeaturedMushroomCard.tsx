import { Link } from 'react-router-dom'
import { type MushroomSpecies } from '../data/mushroomDatabase'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { riskToPlaceholder } from '../lib/edibility'
import { RiskChip } from './RiskChip'

interface Props {
  species: MushroomSpecies
}

/**
 * Featured card — SpeciesImage cascade (single image SSOT).
 * Flat 2D only; RiskChip is orientation only — never green forage clearance.
 */
export function FeaturedMushroomCard({ species }: Props) {
  const slug = scientificNameToSlug(species.scientificName)
  const riskLevel = riskToPlaceholder(null, species.edibility)

  return (
    <div className="featured-mushroom-card featured-mushroom-card--flat">
      <Link
        to={`/enciclopedia/${slug}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div className="featured-mushroom-image">
          <SpeciesImage
            scientificName={species.scientificName}
            slug={slug}
            alt={species.commonNames[0] || species.scientificName}
            variant="card"
            quality="thumb"
            riskLevel={riskLevel}
            layout="fill"
            preferCatalog
            sizes="(max-width: 640px) 45vw, 280px"
            showMediaBadge="auto"
          />
          <span
            className="featured-mushroom-card__risk"
            style={{
              position: 'absolute',
              top: '0.6rem',
              right: '0.6rem',
            }}
          >
            <RiskChip risk={species.edibility} />
          </span>
        </div>
        <div className="featured-mushroom-body">
          <h3>{species.commonNames[0]}</h3>
          <p className="scientific">{species.scientificName}</p>
          <p className="tagline">{species.tagline}</p>
        </div>
      </Link>
    </div>
  )
}
