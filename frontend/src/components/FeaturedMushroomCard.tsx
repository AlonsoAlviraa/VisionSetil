import { Link } from 'react-router-dom'
import { type MushroomSpecies, EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { useSpeciesImage } from '../hooks/useSpeciesImage'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'
import { TiltCard3D } from './TiltCard3D'

interface Props {
  species: MushroomSpecies
}

export function FeaturedMushroomCard({ species }: Props) {
  const { url, loading } = useSpeciesImage(species.scientificName, {
    riskLabel: species.edibility,
  })
  const slug = encodeURIComponent(species.scientificName)
  const placeholder = speciesPhotoErrorFallback(species.scientificName, species.edibility)

  return (
    <TiltCard3D className="featured-mushroom-card">
      <Link
        to={`/enciclopedia/${slug}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div className="featured-mushroom-image">
          <img
            src={url}
            alt={species.commonNames[0] || species.scientificName}
            loading="lazy"
            decoding="async"
            className={loading ? 'is-loading' : ''}
            onError={(e) => {
              const img = e.currentTarget
              if (img.src !== placeholder) img.src = placeholder
            }}
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
    </TiltCard3D>
  )
}
