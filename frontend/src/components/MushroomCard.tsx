/** Species card — always local /media via SpeciesImage (unified Phase A). */
import { Link } from 'react-router-dom'
import type { MushroomSpecies } from '../data/mushroomDatabase'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { riskToPlaceholder } from '../lib/edibility'
import { RiskChip } from './RiskChip'

interface MushroomCardProps {
  species: MushroomSpecies
  slug?: string
  riskLevel?: string
}

/**
 * Browse card — RiskChip only (orientation). Never green edibility forage pills.
 */
export function MushroomCard({ species, slug: slugProp, riskLevel }: MushroomCardProps) {
  const slug = slugProp || scientificNameToSlug(species.scientificName)
  const alt = `${species.commonNames[0] || species.scientificName} (${species.scientificName})`
  const riskRaw = riskLevel || species.edibility

  return (
    <Link to={`/enciclopedia/${slug}`} className="mushroom-card card-glow">
      <div className="mushroom-card-image">
        <SpeciesImage
          scientificName={species.scientificName}
          slug={slug}
          variant="card"
          riskLevel={riskToPlaceholder(riskLevel, species.edibility)}
          alt={alt}
        />
        <span className="mushroom-card-badge mushroom-card-badge--risk">
          <RiskChip risk={riskRaw} />
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
