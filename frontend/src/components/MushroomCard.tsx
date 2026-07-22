/** Species card — always local /media via SpeciesImage (unified Phase A). */
import { Link } from 'react-router-dom'
import type { MushroomSpecies } from '../data/mushroomDatabase'
import { EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { riskToPlaceholder } from '../lib/edibility'

interface MushroomCardProps {
  species: MushroomSpecies
  slug?: string
  riskLevel?: string
}

export function MushroomCard({ species, slug: slugProp, riskLevel }: MushroomCardProps) {
  const slug = slugProp || scientificNameToSlug(species.scientificName)
  const alt = `${species.commonNames[0] || species.scientificName} (${species.scientificName})`

  return (
    <Link to={`/enciclopedia/${slug}`} className="mushroom-card card-3d-tilt card-glow">
      <div className="mushroom-card-image">
        <SpeciesImage
          scientificName={species.scientificName}
          slug={slug}
          variant="card"
          riskLevel={riskToPlaceholder(riskLevel, species.edibility)}
          alt={alt}
        />
        <span
          className="mushroom-card-badge"
          style={{ backgroundColor: EDIBILITY_COLORS[species.edibility] }}
        >
          {EDIBILITY_LABELS[species.edibility]}
        </span>
      </div>
      <div className="mushroom-card-body">
        <h3 className="mushroom-card-name">{species.commonNames[0] || species.scientificName}</h3>
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
