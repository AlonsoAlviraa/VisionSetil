/**
 * Shared onError fallback when no real field photo loads.
 * Flat brand plate only — never a 3D/studio mushroom “model” illustration.
 */
import { mycologyPlaceholderDataUri } from '../data/mycologyPlaceholder'

export function speciesPhotoErrorFallback(
  taxon: string,
  riskLabel?: string | null,
): string {
  return mycologyPlaceholderDataUri(taxon || 'Fungi', riskLabel || undefined)
}
