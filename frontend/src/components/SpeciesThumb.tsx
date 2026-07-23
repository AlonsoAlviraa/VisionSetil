/** Small professional species photo for lists / predictions.
 * Thin wrapper over SpeciesImage with layout="fixed" (Phase C / C-06).
 * Parent sets the box; no minHeight:80 on list sizes.
 */
import { SpeciesImage } from './SpeciesImage'
import { riskToPlaceholder } from '../lib/edibility'
import type { PlaceholderKind } from '../lib/speciesImageUrl'

type Props = {
  taxon: string
  riskLabel?: string | null
  alt?: string
  className?: string
  size?: number
  slug?: string
  priority?: boolean
}

export function SpeciesThumb({
  taxon,
  riskLabel,
  alt,
  className = '',
  size = 48,
  slug,
  priority = false,
}: Props) {
  const kind: PlaceholderKind = riskToPlaceholder(riskLabel)
  const isLarge = size >= 120

  return (
    <span
      className={`species-thumb ${isLarge ? 'species-thumb--lg' : ''} ${className}`.trim()}
      style={{ width: size, height: size, maxWidth: '100%', display: 'inline-block' }}
      data-testid="species-thumb"
    >
      <SpeciesImage
        scientificName={taxon}
        slug={slug}
        variant="thumb"
        layout="fixed"
        width={size}
        height={size}
        riskLevel={kind}
        alt={alt ?? taxon}
        className="species-thumb__img"
        priority={priority}
        minNaturalWidth={8}
      />
    </span>
  )
}
