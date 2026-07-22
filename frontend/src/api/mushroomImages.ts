/**
 * Legacy API — delegates to speciesImageService (mycology-only pipeline).
 */
import {
  resolveSpeciesImageAsync,
  resolveSpeciesImageSync,
} from '../lib/speciesImageService'

const imageCache = new Map<string, string | null>()

export async function getMushroomImage(scientificName: string): Promise<string | null> {
  if (imageCache.has(scientificName)) {
    return imageCache.get(scientificName) ?? null
  }
  const sync = resolveSpeciesImageSync(scientificName)
  if (sync.provider === 'catalog') {
    imageCache.set(scientificName, sync.url)
    return sync.url
  }
  const resolved = await resolveSpeciesImageAsync(scientificName)
  const url = resolved.provider === 'placeholder' ? null : resolved.url
  // still cache displayable URL for UI
  imageCache.set(scientificName, resolved.url)
  return url ?? resolved.url
}

export async function getMushroomImages(
  scientificName: string,
  _limit = 6,
): Promise<Array<{ url: string; caption?: string }>> {
  const url = await getMushroomImage(scientificName)
  return url ? [{ url, caption: scientificName }] : []
}
