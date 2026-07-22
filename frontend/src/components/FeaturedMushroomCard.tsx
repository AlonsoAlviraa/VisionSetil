import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { type MushroomSpecies } from '../data/mushroomDatabase'
import { TiltCard3D } from './TiltCard3D'
import { SpeciesImage } from './SpeciesImage'
import { scientificNameToSlug } from '../lib/slug'
import { EDIBILITY_COLORS_D16, riskToPlaceholder } from '../lib/edibility'

interface Props {
  species: MushroomSpecies
  slug?: string
  riskLevel?: string
}

export function FeaturedMushroomCard({ species, slug: slugProp, riskLevel }: Props) {
  const { t } = useTranslation()
  const slug = slugProp || species.slug || scientificNameToSlug(species.scientificName)
  const color =
    EDIBILITY_COLORS_D16[species.edibility as keyof typeof EDIBILITY_COLORS_D16] ||
    EDIBILITY_COLORS_D16.desconocido
  const label = t(`edibility.${species.edibility}`, { defaultValue: species.edibility })
  const alt = `${species.commonNames[0] || species.scientificName} (${species.scientificName})`
  const risk = riskLevel || species.riskLevel

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <TiltCard3D className="featured-mushroom-card" maxTilt={6} hoverScale={1.03} glare={true}>
        <Link
          to={`/enciclopedia/${slug}`}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          <div className="featured-mushroom-image" style={{ position: 'relative' }}>
            <SpeciesImage
              key={slug}
              scientificName={species.scientificName}
              slug={slug}
              variant="card"
              riskLevel={riskToPlaceholder(risk, species.edibility)}
              alt={alt}
              priority
            />
            <span
              className="edibility-pill"
              style={{
                backgroundColor: color,
                position: 'absolute',
                top: '0.6rem',
                right: '0.6rem',
                color: 'white',
                backdropFilter: 'blur(8px)',
              }}
            >
              {label}
            </span>
          </div>
          <div className="featured-mushroom-body">
            <h3>{species.commonNames[0] || species.scientificName}</h3>
            <p className="scientific">{species.scientificName}</p>
            <p className="tagline">{species.tagline}</p>
          </div>
        </Link>
      </TiltCard3D>
    </motion.div>
  )
}
