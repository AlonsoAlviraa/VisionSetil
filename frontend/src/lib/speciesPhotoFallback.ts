/**
 * Shared onError fallback for species photos — always a displayable seta SVG.
 * Used by SpeciesPhotoCard and SpeciesDetailPage (never reassign a broken remote URL).
 */
import { mycologyPlaceholderDataUri } from '../data/mycologyPlaceholder'

export function speciesPhotoErrorFallback(
  taxon: string,
  riskLabel?: string | null,
): string {
  return mycologyPlaceholderDataUri(taxon || 'Fungi', riskLabel || undefined)
}
