import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { type MushroomSpecies, EDIBILITY_COLORS, EDIBILITY_LABELS } from '../data/mushroomDatabase'
import { getMushroomImage } from '../api/mushroomImages'
import { TiltCard3D } from './TiltCard3D'

interface Props {
  species: MushroomSpecies
}

export function FeaturedMushroomCard({ species }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMushroomImage(species.scientificName).then((url) => {
      if (!cancelled) {
        setImageUrl(url)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [species.scientificName])

  const slug = encodeURIComponent(species.scientificName)

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <TiltCard3D
        className="featured-mushroom-card"
        maxTilt={6}
        hoverScale={1.03}
        glare={true}
      >
        <Link to={`/especie/${slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="featured-mushroom-image">
            {loading ? (
              <div className="mushroom-card-placeholder">
                <motion.span
                  className="mushroom-card-icon"
                  animate={{ y: [0, -8, 0], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {species.icon}
                </motion.span>
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={species.commonNames[0]}
                loading="lazy"
                onError={() => setImageUrl(null)}
              />
            ) : (
              <div className="mushroom-card-placeholder">
                <motion.span
                  className="mushroom-card-icon"
                  animate={{ y: [0, -8, 0], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {species.icon}
                </motion.span>
              </div>
            )}
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
    </motion.div>
  )
}

