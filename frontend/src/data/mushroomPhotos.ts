/**
 * @deprecated Prefer lib/speciesImageService + speciesPhotos.json
 * Kept as thin re-exports for any legacy imports.
 */
import {
  getCatalogPhotoUrl,
  mycologyHeroUrls,
  resolveSpeciesImageSync,
} from '../lib/speciesImageService'
import { mycologyPlaceholderDataUri } from './mycologyPlaceholder'

export function getCuratedMushroomPhoto(taxon: string): string | null {
  return getCatalogPhotoUrl(taxon)
}

export function fallbackMushroomPhoto(taxon: string): string {
  return resolveSpeciesImageSync(taxon).url || mycologyPlaceholderDataUri(taxon)
}

export const MUSHROOM_FALLBACK = mycologyPlaceholderDataUri('Fungi')

export const MUSHROOM_HERO_SHOTS = mycologyHeroUrls(8)

/** Empty map — live catalog is speciesPhotos.json */
export const MUSHROOM_PHOTO_BY_TAXON: Record<string, string> = {}
