import { Link } from 'react-router-dom'
import type { CatalogSpecies } from '../data/speciesCatalog'
import { getFoodQuality } from '../lib/foodQuality'
import { SpeciesNameBlock, NO_LOCAL_COMMON_NAME } from './SpeciesNameBlock'
import { RiskChip } from './RiskChip'
import { FoodQualityChip } from './FoodQualityChip'
import { SpeciesImage } from './SpeciesImage'
import { riskToPlaceholder } from '../lib/edibility'

export { NO_LOCAL_COMMON_NAME }

type Props = {
  species: CatalogSpecies
}

/**
 * Encyclopedia grid card — local /media via SpeciesImage (unified Phase A).
 * Food quality chip only when registry has real curated data.
 */
export function SpeciesPhotoCard({ species }: Props) {
  const common = species.common_names[0]?.trim()
  const food = getFoodQuality(species.taxon)
  const alt = `${common || NO_LOCAL_COMMON_NAME} — ${species.taxon}`

  return (
    <Link to={`/enciclopedia/${species.slug}`} className="species-photo-card">
      <div className="species-photo-card__frame" style={{ aspectRatio: '1/1', overflow: 'hidden' }}>
        <SpeciesImage
          scientificName={species.taxon}
          slug={species.slug}
          variant="card"
          riskLevel={riskToPlaceholder(species.risk_label, species.food_class || undefined)}
          alt={alt}
          showMediaBadge="auto"
        />
        <span className="species-photo-card__chips">
          {food ? (
            <FoodQualityChip foodClass={food.food_class} label={food.label} compact />
          ) : (
            <RiskChip risk={species.risk_label} />
          )}
        </span>
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
