/** GBIF API client — FREE, no API key required.
 * Global Biodiversity Information Facility provides occurrence data,
 * taxonomy, and species information from museums worldwide.
 * Docs: https://www.gbif.org/developer/summary */

const GBIF_BASE = 'https://api.gbif.org/v1'

export interface GBIFOccurrence {
  key: number
  scientificName: string
  decimalLatitude?: number
  decimalLongitude?: number
  country?: string
  year?: number
  media?: GBIFMedia[]
}

export interface GBIFMedia {
  type: string
  format: string
  identifier: string
  title?: string
  creator?: string
  license?: string
}

export interface GBIFSpecies {
  key: number
  scientificName: string
  canonicalName: string
  authorship?: string
  rank: string
  kingdom?: string
  phylum?: string
  class?: string
  order?: string
  family?: string
  genus?: string
  species?: string
  count?: number
}

/** Search for species in GBIF taxonomy */
export async function searchGBIFSpecies(query: string): Promise<GBIFSpecies[]> {
  try {
    const url = `${GBIF_BASE}/species/match?name=${encodeURIComponent(query)}&strict=false`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (data.usageKey) {
      return [
        {
          key: data.usageKey,
          scientificName: data.scientificName ?? query,
          canonicalName: data.canonicalName ?? query,
          authorship: data.authorship,
          rank: data.rank ?? 'SPECIES',
          kingdom: data.kingdom,
          phylum: data.phylum,
          class: data['class'],
          order: data.order,
          family: data.family,
          genus: data.genus,
        },
      ]
    }
    return []
  } catch {
    return []
  }
}

/** Get occurrence count for a species in Spain */
export async function getSpainOccurrenceCount(scientificName: string): Promise<number> {
  try {
    const url = `${GBIF_BASE}/occurrence/count?scientificName=${encodeURIComponent(scientificName)}&country=ES`
    const res = await fetch(url)
    if (!res.ok) return 0
    const data = await res.json()
    return typeof data === 'number' ? data : (data?.count ?? 0)
  } catch {
    return 0
  }
}

/** Get recent observations with photos for a species in Spain */
export async function getRecentObservations(
  scientificName: string,
  limit = 6,
): Promise<GBIFOccurrence[]> {
  try {
    const params = new URLSearchParams({
      scientificName: scientificName,
      country: 'ES',
      mediaType: 'StillImage',
      hasCoordinate: 'true',
      limit: String(limit),
    })
    const url = `${GBIF_BASE}/occurrence/search?${params}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []) as GBIFOccurrence[]
  } catch {
    return []
  }
}

/** Get images for a species from GBIF occurrences */
export async function getSpeciesImages(
  scientificName: string,
  limit = 8,
): Promise<{ url: string; license?: string; creator?: string }[]> {
  const occurrences = await getRecentObservations(scientificName, limit * 2)
  const images: { url: string; license?: string; creator?: string }[] = []
  for (const occ of occurrences) {
    if (occ.media) {
      for (const m of occ.media) {
        if (m.type === 'StillImage' && m.identifier) {
          images.push({ url: m.identifier, license: m.license, creator: m.creator })
          if (images.length >= limit) break
        }
      }
    }
    if (images.length >= limit) break
  }
  return images
}

/** Get taxonomy tree for a species */
export async function getTaxonomy(scientificName: string): Promise<GBIFSpecies | null> {
  const results = await searchGBIFSpecies(scientificName)
  return results[0] ?? null
}