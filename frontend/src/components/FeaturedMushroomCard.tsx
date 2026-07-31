import { Link } from 'react-router-dom'
import { type MushroomSpecies, EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'

interface Props {
  species: MushroomSpecies
}

/**
 * Featured card — SpeciesImage cascade (single image SSOT).
 * Flat 2D only; risk chip is orientation, never consumption clearance.
 */
export function FeaturedMushroomCard({ species }: Props) {
  const slug = scientificNameToSlug(species.scientificName)
  const risk =
    species.edibility === 'mortifero'
      ? 'deadly'
      : species.edibility === 'toxico'
        ? 'toxic'
        : 'default'

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
            riskLevel={risk}
            layout="fill"
            preferCatalog
            sizes="(max-width: 640px) 45vw, 280px"
            showMediaBadge="auto"
          />
          <span
            className="edibility-pill"
            style={{
              backgroundColor: EDIBILITY_COLORS[species.edibility],
              position: 'absolute',
              top: '0.6rem',
              right: '0.6rem',
              color: 'white',
              backdropFilter: 'blur(8px)',
            }}
          >
            {EDIBILITY_LABELS[species.edibility]}
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
