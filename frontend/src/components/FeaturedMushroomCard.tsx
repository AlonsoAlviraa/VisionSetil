import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { type MushroomSpecies, EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { useSpeciesImage } from '../hooks/useSpeciesImage'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'
import { INLINE_PLACEHOLDER_SVG } from '../lib/speciesImageUrl'
interface Props {
  species: MushroomSpecies
}

export function FeaturedMushroomCard({ species }: Props) {
  const { url, loading } = useSpeciesImage(species.scientificName, {
    riskLabel: species.edibility,
    context: 'grid',
    quality: 'thumb',
  })
  const slug = encodeURIComponent(species.scientificName)
  const placeholder = speciesPhotoErrorFallback(species.scientificName, species.edibility)
  /** 0 = primary url, 1 = placeholder SVG, 2 = inline brand SVG (stop) */
  const [stage, setStage] = useState(0)

  // Reset cascade when resolver upgrades URL or species changes
  useEffect(() => {
    setStage(0)
  }, [url, species.scientificName])

  const src =
    stage === 0 ? url : stage === 1 ? placeholder : INLINE_PLACEHOLDER_SVG

  // Flat 2D card only — no TiltCard3D / card-3d chrome
  return (
    <div className="featured-mushroom-card featured-mushroom-card--flat">
      <Link
        to={`/enciclopedia/${slug}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div className="featured-mushroom-image">
          <img
            key={`${species.scientificName}-${stage}-${stage === 0 ? url : 'fb'}`}
            src={src}
            alt={species.commonNames[0] || species.scientificName}
            loading="lazy"
            decoding="async"
            className={loading && stage === 0 ? 'is-loading' : ''}
            onError={() => {
              setStage((s) => Math.min(2, s + 1))
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
    </div>
  )
}
