/** Reusable card for displaying a mushroom species with robust multi-source photo. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MushroomSpecies } from '../data/mushroomDatabase'
import { EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { getMushroomImage } from '../api/mushroomImages'

interface MushroomCardProps {
  species: MushroomSpecies
}

export function MushroomCard({ species }: MushroomCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMushroomImage(species.scientificName).then((url) => {
      if (cancelled) return
      setImageUrl(url)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [species.scientificName])

  const slug = encodeURIComponent(species.scientificName)

  return (
    <Link to={`/enciclopedia/${slug}`} className="mushroom-card card-3d-tilt card-glow">
      <div className="mushroom-card-image">
        {loading ? (
          <div className="mushroom-card-placeholder shimmer">
            <span className="mushroom-card-icon">{species.icon}</span>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={species.commonNames[0]}
            loading="lazy"
            onError={() => {
              setImageUrl(null)
            }}
          />
        ) : (
          <div className="mushroom-card-placeholder">
            <span className="mushroom-card-icon mushroom-float-rotate">{species.icon}</span>
          </div>
        )}
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
          <span className="meta-chip">📅 {species.season}</span>
          <span className="meta-chip">🌳 {species.family}</span>
        </div>
      </div>
    </Link>
  )
}