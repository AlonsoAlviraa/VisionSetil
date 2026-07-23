/** Small professional species photo for lists / predictions.
 * Thin wrapper over SpeciesImage with layout="fixed" (Phase C / C-06).
 * Parent sets the box; no minHeight:80 on list sizes.
 * `fill` mode: fill parent (immersive 4:5 cells) without pinning 56px inline.
 */
import { SpeciesImage } from './SpeciesImage'
import { riskToPlaceholder } from '../lib/edibility'
import type { PlaceholderKind } from '../lib/speciesImageUrl'
import type { SpeciesImageVariant } from '../lib/speciesImageUrl'

type Props = {
  taxon: string
  riskLabel?: string | null
  alt?: string
  className?: string
  /** Pixel box for list rows. Ignored when fill=true. */
  size?: number
  slug?: string
  priority?: boolean
  /** Fill parent box (magazine strip) — no fixed pixel width/height on SpeciesImage. */
  fill?: boolean
  variant?: SpeciesImageVariant
}

export function SpeciesThumb({
  taxon,
  riskLabel,
  alt,
  className = '',
  size = 48,
  slug,
  priority = false,
  fill = false,
  variant = 'thumb',
}: Props) {
  const kind: PlaceholderKind = riskToPlaceholder(riskLabel)
  const isLarge = !fill && size >= 120

  const boxStyle = fill
    ? { width: '100%', height: '100%', maxWidth: '100%', display: 'block' as const }
    : { width: size, height: size, maxWidth: '100%', display: 'inline-block' as const }

  return (
    <span
      className={`species-thumb ${fill ? 'species-thumb--fill' : ''} ${isLarge ? 'species-thumb--lg' : ''} ${className}`.trim()}
      style={boxStyle}
      data-testid="species-thumb"
      data-fill={fill ? '1' : '0'}
    >
      <SpeciesImage
        scientificName={taxon}
        slug={slug}
        variant={variant}
        layout="fixed"
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        riskLevel={kind}
        alt={alt ?? taxon}
        className="species-thumb__img"
        priority={priority}
        minNaturalWidth={8}
      />
    </span>
  )
}
