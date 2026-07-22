/**
 * 🍄 Mushroom Image Service — DEPRECATED hotlink cascade (PR-05).
 *
 * Prefer `SpeciesImage` + `speciesImageUrl` (own media store /api/media).
 * These helpers remain only for optional wiki *text* enrichment and
 * emergency offline demos when FEATURE_SPECIES_MEDIA is disabled.
 *
 * @deprecated Use SpeciesImage / speciesImageUrl instead of card hotlinks.
 */

import { speciesImageUrl } from '../lib/speciesImageUrl'
import { scientificNameToSlug } from '../lib/slug'
import { featureFlags } from '../lib/featureFlags'

const imageCache = new Map<string, string | null>()

/**
 * @deprecated Prefer SpeciesImage component.
 * When FEATURE_SPECIES_MEDIA is on, returns same-origin media URL (no hotlink).
 */
export async function getMushroomImage(scientificName: string): Promise<string | null> {
  if (featureFlags.SPECIES_MEDIA) {
    return speciesImageUrl(scientificNameToSlug(scientificName), 'card')
  }

  if (imageCache.has(scientificName)) {
    return imageCache.get(scientificName) ?? null
  }

  // Try Wikipedia REST summary first — most reliable for browser use
  const wikiImg = await tryWikipedia(scientificName)
  if (wikiImg) {
    imageCache.set(scientificName, wikiImg)
    return wikiImg
  }

  // Fallback: Wikimedia Commons page image
  const commonsImg = await tryWikimediaPageImage(scientificName)
  if (commonsImg) {
    imageCache.set(scientificName, commonsImg)
    return commonsImg
  }

  // Fallback: GBIF
  const gbifImg = await tryGBIF(scientificName)
  if (gbifImg) {
    imageCache.set(scientificName, gbifImg)
    return gbifImg
  }

  imageCache.set(scientificName, null)
  return null
}

async function tryWikipedia(scientificName: string): Promise<string | null> {
  try {
    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(scientificName)}?redirect=true`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.type?.includes('not_found')) return null
    // Prefer original image (higher res), fallback to thumbnail
    return data.originalimage?.source || data.thumbnail?.source || null
  } catch {
    return null
  }
}

async function tryWikimediaPageImage(scientificName: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: scientificName,
      prop: 'pageimages',
      piprop: 'thumbnail|original',
      pithumbsize: '800',
      redirects: '1',
      origin: '*',
    })
    const res = await fetch(`https://es.wikipedia.org/w/api.php?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages ?? {}
    for (const page of Object.values(pages) as any[]) {
      if (page.original?.source) return page.original.source
      if (page.thumbnail?.source) return page.thumbnail.source
    }
    return null
  } catch {
    return null
  }
}

async function tryGBIF(scientificName: string): Promise<string | null> {
  try {
    const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}&strict=false`
    const matchRes = await fetch(matchUrl)
    if (!matchRes.ok) return null
    const matchData = await matchRes.json()
    const usageKey = matchData.usageKey
    if (!usageKey || matchData.matchType === 'NONE') return null

    const mediaUrl = `https://api.gbif.org/v1/occurrence/search?taxonKey=${usageKey}&mediaType=StillImage&limit=3`
    const mediaRes = await fetch(mediaUrl)
    if (!mediaRes.ok) return null
    const mediaData = await mediaRes.json()

    for (const occ of mediaData.results || []) {
      for (const m of occ.media || []) {
        if (m.identifier && !m.identifier.includes('.svg')) {
          return m.identifier
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get multiple images for gallery.
 */
export async function getMushroomImages(
  scientificName: string,
  limit = 8,
): Promise<{ url: string; caption?: string }[]> {
  const images: { url: string; caption?: string }[] = []

  // Wikipedia page images + Commons search
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${scientificName}`,
      gsrnamespace: '6',
      gsrlimit: String(limit),
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '800',
      origin: '*',
    })
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    if (res.ok) {
      const data = await res.json()
      const pages = data.query?.pages ?? {}
      for (const page of Object.values(pages) as any[]) {
        const info = page.imageinfo?.[0]
        if (!info) continue
        if (info.mime && !info.mime.includes('jpeg') && !info.mime.includes('png')) continue
        const url = info.thumburl || info.url
        if (url && !images.some((im) => im.url === url)) {
          images.push({
            url,
            caption: page.title?.replace('File:', '').replace(/\.[^/.]+$/, ''),
          })
        }
        if (images.length >= limit) break
      }
    }
  } catch {
    // continue
  }

  // Also add the Wikipedia summary image if not already included
  const mainImg = await getMushroomImage(scientificName)
  if (mainImg && !images.some((im) => im.url === mainImg)) {
    images.unshift({ url: mainImg })
  }

  return images.slice(0, limit)
}