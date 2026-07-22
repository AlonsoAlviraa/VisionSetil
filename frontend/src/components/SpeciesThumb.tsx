/** Small professional species photo for lists / predictions. */
import { useSpeciesImage } from '../hooks/useSpeciesImage'
import { speciesPhotoErrorFallback } from '../lib/speciesPhotoFallback'

type Props = {
  taxon: string
  riskLabel?: string | null
  alt?: string
  className?: string
  size?: number
}

export function SpeciesThumb({
  taxon,
  riskLabel,
  alt,
  className = '',
  size = 48,
}: Props) {
  const { url, loading } = useSpeciesImage(taxon, {
    riskLabel: riskLabel || undefined,
    context: 'eager',
  })
  const placeholder = speciesPhotoErrorFallback(taxon, riskLabel)

  const isLarge = size >= 120

  return (
    <span
      className={`species-thumb ${loading ? 'species-thumb--loading' : ''} ${isLarge ? 'species-thumb--lg' : ''} ${className}`}
      style={{ width: size, height: size, maxWidth: '100%' }}
    >
      <img
        src={url}
        alt={alt ?? taxon}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget
          if (img.src !== placeholder) img.src = placeholder
        }}
      />
    </span>
  )
}
