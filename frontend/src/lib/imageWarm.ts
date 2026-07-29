/**
 * Warm browser image cache for above-the-fold mycology photos.
 * Safe no-op outside the browser; never blocks the main thread.
 */
import {
  getCatalogPhotoUrlHd,
  mycologyHeroUrls,
  type PhotoDisplayQuality,
} from './speciesImageService'

const warmed = new Set<string>()

/** Fire-and-forget decode into browser HTTP cache. */
export function warmImageUrl(url: string | null | undefined): void {
  if (!url || url.startsWith('data:')) return
  if (typeof Image === 'undefined') return
  if (warmed.has(url)) return
  warmed.add(url)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'
    img.src = url
  } catch {
    /* ignore */
  }
}

/** Inject <link rel="preload" as="image"> for LCP (hero). */
export function preloadImageLink(url: string | null | undefined): void {
  if (!url || url.startsWith('data:')) return
  if (typeof document === 'undefined') return
  const id = `preload-img-${url.slice(-48)}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'preload'
  link.as = 'image'
  link.href = url
  link.setAttribute('fetchpriority', 'high')
  // referrer for privacy parity with <img referrerPolicy="no-referrer">
  link.setAttribute('referrerpolicy', 'no-referrer')
  document.head.appendChild(link)
}

/**
 * Call once at shell boot: preload home hero + warm a few seasonal icons.
 * Keeps network modest (4–6 images, display/thumb quality only).
 */
export function warmCriticalSpeciesImages(): void {
  if (typeof window === 'undefined') return
  try {
    const heroes = mycologyHeroUrls(2, 'display')
    if (heroes[0]) {
      preloadImageLink(heroes[0])
      warmImageUrl(heroes[0])
    }
    if (heroes[1]) warmImageUrl(heroes[1])

    // Small set of grid thumbs the home season strip + encyclopedia often paint first
    const early: Array<[string, PhotoDisplayQuality]> = [
      ['Amanita muscaria', 'display'],
      ['Boletus edulis', 'thumb'],
      ['Cantharellus cibarius', 'thumb'],
      ['Lactarius deliciosus', 'thumb'],
      ['Amanita phalloides', 'thumb'],
    ]
    for (const [taxon, q] of early) {
      warmImageUrl(getCatalogPhotoUrlHd(taxon, q))
    }
  } catch {
    /* ignore warm failures */
  }
}

/** Test helper */
export function clearImageWarmCache(): void {
  warmed.clear()
}
