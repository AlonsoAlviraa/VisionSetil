/** Species card with verified mycology photo (never emoji placeholders). */
import { Link } from 'react-router-dom'
import type { MushroomSpecies } from '../data/mushroomDatabase'
import { EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { useSpeciesImage } from '../hooks/useSpeciesImage'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'

interface MushroomCardProps {
  species: MushroomSpecies
}

export function MushroomCard({ species }: MushroomCardProps) {
  const { url, loading } = useSpeciesImage(species.scientificName, species.edibility)
  const slug = encodeURIComponent(species.scientificName)
  const placeholder = speciesPhotoErrorFallback(species.scientificName, species.edibility)

  return (
    <Link to={`/enciclopedia/${slug}`} className="mushroom-card card-3d-tilt card-glow">
      <div className="mushroom-card-image">
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
          className="mushroom-card-badge"
          style={{ backgroundColor: EDIBILITY_COLORS[species.edibility] }}
        >
          {EDIBILITY_LABELS[species.edibility]}
        </span>
      </div>
      <div className="mushroom-card-body">
        <h3 className="mushroom-card-name">{species.commonNames[0]}</h3>
        <p className="mushroom-card-scientific">
          <em>{species.scientificName}</em>
        </p>
        <p className="mushroom-card-tagline">{species.tagline}</p>
        <div className="mushroom-card-meta">
          <span className="meta-chip">{species.season}</span>
          <span className="meta-chip">{species.family}</span>
        </div>
      </div>
    </Link>
  )
}
