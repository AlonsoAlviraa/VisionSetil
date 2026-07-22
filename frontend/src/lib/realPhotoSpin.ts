/**
 * Real multi-angle mushroom photos for 360° product-style spin.
 * Sources: species catalog + iNaturalist research-grade observations.
 * No procedural 3D — only real photographs.
 */

import { getCatalogPhotoUrl } from './speciesImageService'

export type SpinPhoto = {
  url: string
  source: 'catalog' | 'inaturalist' | 'wikipedia'
  attribution?: string
}

export type SpinPhotoSet = {
  taxon: string
  frames: SpinPhoto[]
  /** True when ≥2 frames for drag-to-spin */
  canSpin: boolean
}

const memoryCache = new Map<string, SpinPhotoSet>()

/** Map drag distance → frame index (pure, unit-tested). */
export function frameIndexFromDrag(
  startIndex: number,
  deltaX: number,
  frameCount: number,
  pixelsPerFrame = 28,
): number {
  if (frameCount <= 0) return 0
  if (frameCount === 1) return 0
  const steps = Math.round(deltaX / pixelsPerFrame)
  // Drag right → next frame (feels like turning object to the right)
  let idx = startIndex + steps
  // Wrap around for infinite spin feel
  idx = ((idx % frameCount) + frameCount) % frameCount
  return idx
}

/** Autoplay: advance frame with wrap. */
export function nextFrameIndex(current: number, frameCount: number, dir = 1): number {
  if (frameCount <= 1) return 0
  return (current + dir + frameCount) % frameCount
}

function upgradeInatUrl(url: string): string {
  return url
    .replace('/square.', '/large.')
    .replace('/small.', '/large.')
    .replace('/medium.', '/large.')
    .replace('/thumb.', '/large.')
}

function uniqueUrls(photos: SpinPhoto[]): SpinPhoto[] {
  const seen = new Set<string>()
  const out: SpinPhoto[] = []
  for (const p of photos) {
    const key = p.url.split('?')[0]
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/**
 * Fetch real observation photos for a scientific name from iNaturalist.
 * Research-grade preferred; falls back to any with photos.
 */
export async function fetchInatSpinFrames(
  taxon: string,
  limit = 24,
): Promise<SpinPhoto[]> {
  const name = taxon.trim()
  if (!name) return []

  try {
    const q = new URLSearchParams({
      taxon_name: name,
      photos: 'true',
      quality_grade: 'research',
      per_page: String(Math.min(limit, 30)),
      order_by: 'votes',
      order: 'desc',
    })
    let res = await fetch(`https://api.inaturalist.org/v1/observations?${q}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    let data = await res.json()
    let results = (data.results || []) as Array<{
      photos?: Array<{ url?: string; attribution?: string; original_dimensions?: { width?: number } }>
      taxon?: { name?: string }
    }>

    // Fallback without research grade if too few
    if (results.length < 4) {
      const q2 = new URLSearchParams({
        taxon_name: name,
        photos: 'true',
        per_page: String(Math.min(limit, 30)),
        order_by: 'votes',
      })
      res = await fetch(`https://api.inaturalist.org/v1/observations?${q2}`, {
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        data = await res.json()
        results = (data.results || []) as typeof results
      }
    }

    const frames: SpinPhoto[] = []
    for (const obs of results) {
      const taxonOk =
        !obs.taxon?.name ||
        obs.taxon.name.toLowerCase() === name.toLowerCase() ||
        obs.taxon.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])
      if (!taxonOk) continue
      for (const ph of obs.photos || []) {
        if (!ph.url) continue
        frames.push({
          url: upgradeInatUrl(ph.url),
          source: 'inaturalist',
          attribution: ph.attribution || 'iNaturalist',
        })
        if (frames.length >= limit) break
      }
      if (frames.length >= limit) break
    }
    return uniqueUrls(frames)
  } catch {
    return []
  }
}

/** Build spin set: catalog first, then iNat multi-angle. */
export async function resolveSpinPhotoSet(
  taxon: string,
  options: { maxFrames?: number; useCache?: boolean } = {},
): Promise<SpinPhotoSet> {
  const name = taxon.trim() || 'Fungi'
  const maxFrames = options.maxFrames ?? 24
  const useCache = options.useCache !== false
  const key = name.toLowerCase()

  if (useCache && memoryCache.has(key)) {
    return memoryCache.get(key)!
  }

  const frames: SpinPhoto[] = []
  const catalog = getCatalogPhotoUrl(name)
  if (catalog) {
    frames.push({ url: catalog, source: 'catalog', attribution: 'Catálogo VisionSetil' })
  }

  const inat = await fetchInatSpinFrames(name, maxFrames)
  for (const f of inat) {
    frames.push(f)
  }

  const unique = uniqueUrls(frames).slice(0, maxFrames)
  const set: SpinPhotoSet = {
    taxon: name,
    frames: unique,
    canSpin: unique.length >= 2,
  }
  if (useCache) memoryCache.set(key, set)
  return set
}

export function clearSpinPhotoCache() {
  memoryCache.clear()
}

/** Preload image URLs; returns how many loaded ok. */
export function preloadImages(urls: string[]): Promise<number> {
  if (typeof Image === 'undefined') return Promise.resolve(0)
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<boolean>((resolve) => {
          const img = new Image()
          img.onload = () => resolve(true)
          img.onerror = () => resolve(false)
          img.decoding = 'async'
          img.src = url
        }),
    ),
  ).then((flags) => flags.filter(Boolean).length)
}
