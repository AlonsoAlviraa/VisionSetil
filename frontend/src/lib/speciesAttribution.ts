/**
 * Species photo attribution — meta.json (local media) + catalog photos JSON.
 * Pure helpers for ficha / gallery chrome. Hide UI when no usable meta.
 * Offline: Cache API first (pack + SW species-media), then network fetch.
 *
 * T4: does NOT static-import speciesPhotos.json — uses speciesImageService getters
 * after hydrateSpeciesPhotos() so the JSON is loaded once.
 */
import type { ImageAttributionMeta } from '../components/ui/ImageAttribution'
import { mediaPublicPrefix } from './speciesImageUrl'
import { scientificNameToSlug } from './slug'
import { getCatalogPhotoEntry } from './speciesImageService'

/**
 * Must match offlinePack.OFFLINE_PACK_CACHE + SW_SPECIES_MEDIA_CACHE.
 * Duplicated as strings to avoid circular import (attribution ↔ offlinePack).
 */
const META_CACHE_NAMES = ['visionsetil-offline-pack-v1', 'species-media'] as const

export type SpeciesMediaMetaJson = {
  slug?: string
  scientific_name?: string
  source?: string | null
  source_url?: string | null
  license?: string | null
  license_url?: string | null
  creator?: string | null
  attribution_text?: string | null
}

/** Human-friendly short license labels for common open licences. */
export function shortLicenseLabel(license: string | null | undefined): string | null {
  if (!license) return null
  const raw = license.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.includes('publicdomain/zero') || lower === 'cc0' || lower.includes('cc0')) {
    return 'CC0'
  }
  if (lower.includes('by-nc-sa')) return 'CC BY-NC-SA'
  if (lower.includes('by-nc')) return 'CC BY-NC'
  if (lower.includes('by-sa')) return 'CC BY-SA'
  if (lower.includes('/by/') || lower === 'cc-by' || lower.endsWith('by/4.0/')) return 'CC BY'
  if (lower === 'wikipedia-page-image') return 'Wikipedia'
  if (lower === 'gbif-media') return 'GBIF'
  if (lower.startsWith('http')) {
    // Keep host path tail readable rather than full URL noise in UI
    try {
      const u = new URL(raw)
      if (u.hostname.includes('creativecommons')) {
        const parts = u.pathname.split('/').filter(Boolean)
        const code = parts.find((p) => p.startsWith('by') || p === 'zero')
        if (code === 'zero') return 'CC0'
        // Keep hyphens: by-sa → CC BY-SA
        if (code) return `CC ${code.toUpperCase()}`
      }
    } catch {
      /* keep raw */
    }
  }
  // Already short token
  if (raw.length <= 24) return raw
  return raw.slice(0, 40) + '…'
}

export function hasAttributionMeta(meta: ImageAttributionMeta | null | undefined): boolean {
  if (!meta) return false
  return Boolean(
    meta.attribution_text?.trim() ||
      meta.creator?.trim() ||
      meta.license?.trim() ||
      meta.source_url?.trim(),
  )
}

/** Normalize any partial meta into ImageAttributionMeta (or null if empty). */
export function normalizeAttributionMeta(
  partial: Partial<ImageAttributionMeta> | null | undefined,
): ImageAttributionMeta | null {
  if (!partial) return null
  const creator = partial.creator?.trim() || null
  const licenseRaw = partial.license?.trim() || null
  const license = shortLicenseLabel(licenseRaw) || licenseRaw
  const source_url = partial.source_url?.trim() || null
  const attribution_text = partial.attribution_text?.trim() || null

  // Build display text if only pieces exist
  let text = attribution_text
  if (!text) {
    const bits = [creator, license].filter(Boolean)
    text = bits.length ? bits.join(' · ') : null
  } else if (license && !text.includes(license) && licenseRaw && text.includes(licenseRaw)) {
    // Prefer short license inside long attribution strings
    text = text.replace(licenseRaw, license)
  }

  const out: ImageAttributionMeta = {
    creator,
    license,
    source_url,
    attribution_text: text,
  }
  return hasAttributionMeta(out) ? out : null
}

export function attributionFromMediaMetaJson(
  raw: SpeciesMediaMetaJson | null | undefined,
): ImageAttributionMeta | null {
  if (!raw) return null
  return normalizeAttributionMeta({
    creator: raw.creator,
    license: raw.license || raw.license_url,
    source_url: raw.source_url || raw.license_url || null,
    attribution_text: raw.attribution_text,
  })
}

/** Sync attribution from speciesPhotos via speciesImageService (after hydrate). */
export function attributionFromCatalog(
  taxonOrSlug: string,
): ImageAttributionMeta | null {
  if (!taxonOrSlug?.trim()) return null
  const entry = getCatalogPhotoEntry(taxonOrSlug)
  if (!entry) {
    // Try slug form as well (e.g. boletus-edulis)
    const slug = scientificNameToSlug(taxonOrSlug)
    if (slug && slug !== taxonOrSlug.trim().toLowerCase()) {
      const bySlug = getCatalogPhotoEntry(slug)
      if (!bySlug) return null
      const providerLabel = formatProvider(bySlug.provider)
      return normalizeAttributionMeta({
        creator: bySlug.creator || providerLabel,
        license: bySlug.license,
        source_url: bySlug.url?.startsWith('http') ? bySlug.url : null,
        attribution_text: bySlug.attribution_text || undefined,
      })
    }
    return null
  }

  const providerLabel = formatProvider(entry.provider)
  return normalizeAttributionMeta({
    creator: entry.creator || providerLabel,
    license: entry.license,
    source_url: entry.url?.startsWith('http') ? entry.url : null,
    attribution_text: entry.attribution_text || undefined,
  })
}

function formatProvider(provider?: string): string | null {
  if (!provider) return null
  const p = provider.toLowerCase()
  if (p.includes('wikipedia')) return 'Wikipedia'
  if (p.includes('inaturalist') || p === 'inat') return 'iNaturalist'
  if (p.includes('gbif')) return 'GBIF'
  if (p.includes('local')) return 'VisionSetil media'
  return provider
}

/**
 * Prefer richer meta first (media meta.json / gallery API), then catalog.
 */
export function coalesceAttribution(
  ...candidates: Array<ImageAttributionMeta | null | undefined>
): ImageAttributionMeta | null {
  let best: ImageAttributionMeta | null = null
  let bestScore = -1
  for (const c of candidates) {
    const n = normalizeAttributionMeta(c)
    if (!n) continue
    let score = 0
    if (n.creator) score += 4
    if (n.license) score += 2
    if (n.attribution_text) score += 3
    if (n.source_url) score += 1
    // Prefer named photographers over generic "Wikipedia" alone when tied on structure
    if (n.creator && !/^(wikipedia|gbif|inaturalist|visionsetil)/i.test(n.creator)) {
      score += 2
    }
    if (score > bestScore) {
      bestScore = score
      best = n
    }
  }
  return best
}

/** Public URL for local media meta.json (Vite /media or API prefix). */
export function speciesMetaJsonUrl(slug: string): string {
  const s = scientificNameToSlug(slug) || slug.toLowerCase().trim()
  return `${mediaPublicPrefix()}/species/${encodeURIComponent(s)}/meta.json`
}

/**
 * URL variants for Cache API match — pack stores absolute URLs when window exists;
 * fetch paths are often relative.
 */
export function metaJsonCacheUrlCandidates(url: string): string[] {
  const out = new Set<string>([url])
  if (url.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    out.add(`${window.location.origin}${url}`)
  } else if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      out.add(u.pathname + u.search)
    } catch {
      /* keep original */
    }
  }
  return Array.from(out)
}

/**
 * Look up meta.json in offline pack + SW species-media caches (U6 offline attribution).
 * Workbox does not register JSON routes; pack still puts meta into these caches.
 */
export async function matchCachedMetaResponse(url: string): Promise<Response | null> {
  if (typeof caches === 'undefined') return null
  const candidates = metaJsonCacheUrlCandidates(url)
  for (const name of META_CACHE_NAMES) {
    try {
      const cache = await caches.open(name)
      for (const key of candidates) {
        const hit = await cache.match(key)
        if (hit && hit.ok) return hit
      }
    } catch {
      /* private mode / missing cache */
    }
  }
  return null
}

/**
 * Fetch local media meta.json.
 * Offline path: Cache API (pack + species-media) first, then network.
 * Returns null on 404 / network error / empty meta.
 */
export async function fetchSpeciesMediaMeta(
  slug: string,
): Promise<ImageAttributionMeta | null> {
  const s = scientificNameToSlug(slug) || slug.toLowerCase().trim()
  if (!s) return null
  const urls = [
    speciesMetaJsonUrl(s),
    // API-style prefix if app is deployed behind FastAPI only
    `/api/media/species/${encodeURIComponent(s)}/meta.json`,
  ]
  for (const url of urls) {
    try {
      // Prefer pack/SW cache so photographer meta works offline after pack download
      const cached = await matchCachedMetaResponse(url)
      if (cached) {
        const data = (await cached.clone().json()) as SpeciesMediaMetaJson
        const meta = attributionFromMediaMetaJson(data)
        if (meta) return meta
      }
    } catch {
      /* try network */
    }
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = (await res.json()) as SpeciesMediaMetaJson
      const meta = attributionFromMediaMetaJson(data)
      if (meta) return meta
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * Resolve attribution for a ficha hero: media meta → catalog → null.
 * Sync catalog is available immediately; async enriches with photographer.
 */
export async function resolveSpeciesAttribution(
  slug: string,
  scientificName?: string,
): Promise<ImageAttributionMeta | null> {
  const fromMedia = await fetchSpeciesMediaMeta(slug)
  const fromCatalog = attributionFromCatalog(scientificName || slug)
  return coalesceAttribution(fromMedia, fromCatalog)
}
