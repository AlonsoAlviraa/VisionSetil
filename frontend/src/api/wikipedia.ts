/**
 * Wikipedia REST API client for fetching mushroom photos and enriched content.
 * Uses the public Wikimedia REST API (no key required).
 */

export interface WikiImage {
  url: string
  caption?: string
  license?: string
  artist?: string
}

export interface WikiSummary {
  title: string
  extract: string
  thumbnail?: string
  fullImage?: string
  url: string
}

export interface WikiMedia {
  images: WikiImage[]
}

const REST_BASE = 'https://es.wikipedia.org/api/rest_v1'
const API_BASE = 'https://es.wikipedia.org/w/api.php'
const COM_BASE = 'https://commons.wikimedia.org/w/api.php'

// In-memory cache to avoid refetching the same species
const summaryCache = new Map<string, WikiSummary | null>()
const mediaCache = new Map<string, WikiImage[]>()

/**
 * Get the Wikipedia page summary (extract + thumbnail) for a scientific name.
 * Returns null on error or if not found.
 */
export async function getWikiSummary(scientificName: string): Promise<WikiSummary | null> {
  if (summaryCache.has(scientificName)) {
    return summaryCache.get(scientificName) ?? null
  }

  try {
    const url = `${REST_BASE}/page/summary/${encodeURIComponent(scientificName)}?redirect=true`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      summaryCache.set(scientificName, null)
      return null
    }

    const data = await res.json()

    // Wikipedia returns a 404-like type for missing pages
    if (data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
      summaryCache.set(scientificName, null)
      return null
    }

    const summary: WikiSummary = {
      title: data.title ?? scientificName,
      extract: data.extract ?? '',
      thumbnail: data.thumbnail?.source,
      fullImage: data.originalimage?.source,
      url: data.content_urls?.desktop?.page ?? '',
    }

    summaryCache.set(scientificName, summary)
    return summary
  } catch {
    summaryCache.set(scientificName, null)
    return null
  }
}

/**
 * Search Wikipedia for mushroom-related articles and return suggestions.
 */
export async function searchWikiArticles(
  query: string,
  limit = 8,
): Promise<{ title: string; description: string; thumbnail?: string; url: string }[]> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'search',
      srsearch: `${query} seta hongo`,
      srlimit: String(limit),
      origin: '*',
    })
    const res = await fetch(`${API_BASE}?${params}`)
    if (!res.ok) return []

    const data = await res.json()
    const results = data.query?.search ?? []

    // Fetch thumbnails for the top results
    const titles = results.map((r: { title: string }) => r.title).join('|')
    if (!titles) return []

    const thumbParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles,
      prop: 'pageimages|description',
      piprop: 'thumbnail',
      pithumbsize: '300',
      origin: '*',
    })
    const thumbRes = await fetch(`${API_BASE}?${thumbParams}`)
    const thumbData = await thumbRes.json()
    const pages = thumbData.query?.pages ?? {}
    const pageArr = Object.values(pages) as {
      title: string
      description?: string
      thumbnail?: { source: string }
    }[]

    return results.map((r: { title: string; snippet?: string }) => {
      const page = pageArr.find((p) => p.title === r.title)
      return {
        title: r.title,
        description: page?.description ?? '',
        thumbnail: page?.thumbnail?.source,
        url: `https://es.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
      }
    })
  } catch {
    return []
  }
}

/**
 * Fetch multiple images from Wikimedia Commons for a species.
 * Returns up to `limit` usable images with metadata.
 */
export async function getWikiMediaImages(scientificName: string, limit = 6): Promise<WikiImage[]> {
  if (mediaCache.has(scientificName)) {
    return mediaCache.get(scientificName) ?? []
  }

  try {
    // First, get the Commons category or file list
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: scientificName,
      prop: 'pageimages|extracts',
      piprop: 'thumbnail',
      pithumbsize: '600',
      explaintext: '1',
      exintro: '1',
      redirects: '1',
      origin: '*',
    })

    const res = await fetch(`${API_BASE}?${params}`)
    if (!res.ok) return []

    const data = await res.json()
    const pages = data.query?.pages ?? {}
    const images: WikiImage[] = []

    for (const page of Object.values(pages) as {
      thumbnail?: { source: string }
      extract?: string
      title: string
    }[]) {
      if (page.thumbnail?.source) {
        images.push({
          url: page.thumbnail.source,
          caption: page.title,
        })
      }
    }

    // Also search Commons for additional photos
    const commonsParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${scientificName}`,
      gsrnamespace: '6', // File namespace
      gsrlimit: String(limit),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime',
      iiurlwidth: '600',
      origin: '*',
    })

    const comRes = await fetch(`${COM_BASE}?${commonsParams}`)
    if (comRes.ok) {
      const comData = await comRes.json()
      const comPages = comData.query?.pages ?? {}
      for (const page of Object.values(comPages) as {
        imageinfo?: {
          url: string
          thumburl?: string
          mime: string
          extmetadata?: {
            ImageDescription?: { value: string }
            Artist?: { value: string }
            LicenseShortName?: { value: string }
          }
        }[]
        title: string
      }[]) {
        const info = page.imageinfo?.[0]
        if (!info) continue
        // Skip SVGs and diagrams
        if (info.mime && !info.mime.startsWith('image/jpeg') && !info.mime.startsWith('image/png'))
          continue

        const imgUrl = info.thumburl ?? info.url
        if (imgUrl && !images.some((im) => im.url === imgUrl)) {
          images.push({
            url: imgUrl,
            caption: page.title.replace('File:', '').replace(/\.[^/.]+$/, ''),
            license: info.extmetadata?.LicenseShortName?.value,
            artist: info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim(),
          })
        }
      }
    }

    const result = images.slice(0, limit)
    mediaCache.set(scientificName, result)
    return result
  } catch {
    mediaCache.set(scientificName, [])
    return []
  }
}

/**
 * Fetch the Wikipedia article extract in Spanish for a species.
 */
export async function getWikiExtract(scientificName: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: scientificName,
      prop: 'extracts',
      explaintext: '1',
      exintro: '1',
      redirects: '1',
      origin: '*',
    })
    const res = await fetch(`${API_BASE}?${params}`)
    if (!res.ok) return ''

    const data = await res.json()
    const pages = data.query?.pages ?? {}
    const page = Object.values(pages)[0] as { extract?: string } | undefined
    return page?.extract ?? ''
  } catch {
    return ''
  }
}