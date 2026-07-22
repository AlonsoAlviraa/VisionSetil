import { Link } from 'react-router-dom'
import type { CatalogSpecies } from '../data/speciesCatalog'
import { useSpeciesImage } from '../hooks/useSpeciesImage'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'
import { getFoodQuality } from '../lib/foodQuality'
import { SpeciesNameBlock, NO_LOCAL_COMMON_NAME } from './SpeciesNameBlock'
import { RiskChip } from './RiskChip'
import { FoodQualityChip } from './FoodQualityChip'
import { PhotoFrame } from './PhotoFrame'

export { NO_LOCAL_COMMON_NAME }

type Props = {
  species: CatalogSpecies
}

/**
 * Encyclopedia grid card — photo tier grid policy (no remote wiki/iNat).
 * Food quality chip only when registry has real curated data.
 */
export function SpeciesPhotoCard({ species }: Props) {
  const { url, loading } = useSpeciesImage(species.taxon, {
    riskLabel: species.risk_label,
    context: 'grid',
    tier: species.photo_tier,
  })
  const common = species.common_names[0]?.trim()
  const placeholder = speciesPhotoErrorFallback(species.taxon, species.risk_label)
  const food = getFoodQuality(species.taxon)

  return (
    <Link to={`/enciclopedia/${species.slug}`} className="species-photo-card">
      <PhotoFrame
        src={url}
        alt={`${common || NO_LOCAL_COMMON_NAME} — ${species.taxon}`}
        ratio="1/1"
        loading={loading}
        onErrorSrc={placeholder}
        className="species-photo-card__frame"
        overlay={
          <span className="species-photo-card__chips">
            {food ? (
              <FoodQualityChip foodClass={food.food_class} label={food.label} compact />
            ) : (
              <RiskChip risk={species.risk_label} />
            )}
          </span>
        }
      />
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
