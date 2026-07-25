/**
 * Offline pack for España (S5 + Phase D-14 / U6) — season pack + T0/T1 priority.
 * Pure helpers + Cache API when available. Educational / PWA shell only.
 * Does not classify offline — study/reference only (not food-safe ID).
 */
import { loadSpeciesCatalog, speciesCatalog } from '../data/speciesCatalog'
import { getCatalogPhotoUrl } from './speciesImageService'
import { PHOTO_TIER_T0, getPhotoTier, type PhotoTier } from '../data/photoTiers'
import {
  currentSeason,
  taxaForSeasonFromPack,
  type SeasonId,
} from './seasonRadar'
import {
  galleryImageUrl,
  placeholderImageUrl,
  speciesImageUrl,
  type PlaceholderKind,
} from './speciesImageUrl'
import { scientificNameToSlug } from './slug'
import { speciesMetaJsonUrl } from './speciesAttribution'

export async function ensureOfflineCatalog() {
  return loadSpeciesCatalog()
}

/** Dedicated pack cache (progress / clear). Also mirrors into SW runtime caches. */
export const OFFLINE_PACK_CACHE = 'visionsetil-offline-pack-v1'
/** Must match vite-plugin-pwa workbox cacheName for /media/species/* */
export const SW_SPECIES_MEDIA_CACHE = 'species-media'
/** Must match vite-plugin-pwa workbox cacheName for placeholders */
export const SW_PLACEHOLDER_CACHE = 'species-media-placeholders'
export const OFFLINE_PACK_META_KEY = 'visionsetil_offline_pack_meta'

/** Gallery angles to prefetch per taxon (U6 multi-view offline fichas). */
const OFFLINE_GALLERY_MAX = 4

export type OfflinePackKind = 'season' | 'priority'

export type OfflinePackEntry = {
  taxon: string
  slug: string
  common_name: string
  family_es: string | null
  risk_label: string
  photo_tier: PhotoTier
  photo_url: string | null
  /** D-14: media honesty hint for UI badges */
  media_status?: string | null
}

export type OfflinePackMeta = {
  savedAt: number
  count: number
  withPhotos: number
  taxons: string[]
  /** Slugs used to rebuild asset URL list on clear (SW mirror cleanup). */
  slugs?: string[]
  kind?: OfflinePackKind
  seasonId?: SeasonId | null
}

/** Build the offline pack list: all T0 + T1 with optional catalog photo URL. */
export function buildOfflinePackEntries(limit = 80): OfflinePackEntry[] {
  const preferred = new Set(PHOTO_TIER_T0.map((t) => t.toLowerCase()))
  const rows: OfflinePackEntry[] = []

  // Prefer T0 order first
  for (const name of PHOTO_TIER_T0) {
    const s = speciesCatalog.find((c) => c.taxon.toLowerCase() === name.toLowerCase())
    if (!s) continue
    rows.push(toEntry(s))
  }

  for (const s of speciesCatalog) {
    if (preferred.has(s.taxon.toLowerCase())) continue
    const tier = s.photo_tier || getPhotoTier(s.taxon, s.risk_label)
    if (tier !== 'T0' && tier !== 'T1') continue
    rows.push(toEntry(s))
    if (rows.length >= limit) break
  }
  return rows.slice(0, limit)
}

/**
 * D-14 / U6: season pack offline list (sync, no full catalog required for taxa list).
 * Uses same-origin media URLs via mediaPublicPrefix helpers.
 */
export function buildSeasonOfflinePackEntries(
  seasonId?: SeasonId,
  limit = 16,
): OfflinePackEntry[] {
  const id = seasonId ?? (currentSeason().id as SeasonId)
  const taxa = taxaForSeasonFromPack(id, limit)
  return taxa.map((t) => {
    const card = t.urls?.card || t.urls?.thumb || speciesImageUrl(t.slug, 'card')
    const kind = (t.placeholder_kind || 'default') as PlaceholderKind
    const placeholder = placeholderImageUrl(
      ['default', 'toxic', 'deadly', 'unknown'].includes(kind) ? kind : 'default',
    )
    return {
      taxon: t.taxon,
      slug: t.slug,
      common_name: t.common_name || 'Sin nombre común local',
      family_es: null,
      risk_label: t.risk_label,
      photo_tier: 'T0' as PhotoTier,
      photo_url: card || placeholder,
      media_status: t.media_status ?? null,
    }
  })
}

/**
 * U6: all same-origin assets to prefetch for a pack.
 * card + detail + thumb + gallery(01–04) + meta.json + placeholders.
 * Uses mediaPublicPrefix-aware helpers so VITE_MEDIA_PUBLIC_PREFIX works.
 */
export function offlinePackAssetUrls(entries: OfflinePackEntry[]): string[] {
  const urls = new Set<string>()
  for (const e of entries) {
    if (e.photo_url) urls.add(e.photo_url)
    if (e.slug) {
      urls.add(speciesImageUrl(e.slug, 'card'))
      urls.add(speciesImageUrl(e.slug, 'detail'))
      urls.add(speciesImageUrl(e.slug, 'thumb'))
      for (let i = 1; i <= OFFLINE_GALLERY_MAX; i++) {
        urls.add(galleryImageUrl(e.slug, i))
      }
      // Local meta for attribution on ficha when offline (read via caches.match)
      urls.add(speciesMetaJsonUrl(e.slug))
    }
  }
  for (const kind of ['default', 'toxic', 'deadly', 'unknown'] as const) {
    urls.add(placeholderImageUrl(kind))
  }
  return Array.from(urls).map((u) => normalizeOfflineUrl(u))
}

/**
 * Rebuild asset URL list from saved pack meta (for clear / audit).
 */
export function offlinePackAssetUrlsFromMeta(meta: OfflinePackMeta | null | undefined): string[] {
  if (!meta) return []
  if (meta.kind === 'season') {
    const seasonId = (meta.seasonId || undefined) as SeasonId | undefined
    const entries = buildSeasonOfflinePackEntries(seasonId, meta.count || 16)
    return offlinePackAssetUrls(entries)
  }
  const slugs =
    meta.slugs?.filter(Boolean) ||
    (meta.taxons || []).map((t) => scientificNameToSlug(t)).filter(Boolean)
  if (!slugs.length) return []
  const entries: OfflinePackEntry[] = slugs.map((slug, i) => ({
    taxon: meta.taxons?.[i] || slug,
    slug,
    common_name: '—',
    family_es: null,
    risk_label: 'dangerous_or_unknown',
    photo_tier: 'T0',
    photo_url: speciesImageUrl(slug, 'card'),
  }))
  return offlinePackAssetUrls(entries)
}

function toEntry(s: {
  taxon: string
  slug: string
  common_names: string[]
  family_es?: string | null
  risk_label: string
  photo_tier?: PhotoTier
}): OfflinePackEntry {
  const catalogUrl = getCatalogPhotoUrl(s.taxon)
  const localUrl = speciesImageUrl(s.slug, 'card')
  return {
    taxon: s.taxon,
    slug: s.slug,
    common_name: s.common_names[0] || 'Sin nombre común local',
    family_es: s.family_es || null,
    risk_label: s.risk_label,
    photo_tier: s.photo_tier || getPhotoTier(s.taxon, s.risk_label),
    // Prefer same-origin media for reliable Cache API
    photo_url: localUrl || catalogUrl,
  }
}

/** Absolute or same-origin relative photo URLs suitable for Cache API. */
export function offlinePackPhotoUrls(entries: OfflinePackEntry[]): string[] {
  return entries
    .map((e) => e.photo_url)
    .filter((u): u is string => Boolean(u))
    .map((u) => normalizeOfflineUrl(u))
}

/** Resolve relative /media paths to absolute when window is available. */
export function normalizeOfflineUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (url.startsWith('/')) return `${window.location.origin}${url}`
  }
  return url
}

export function readOfflinePackMeta(): OfflinePackMeta | null {
  try {
    const raw = localStorage.getItem(OFFLINE_PACK_META_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OfflinePackMeta
  } catch {
    return null
  }
}

export function writeOfflinePackMeta(meta: OfflinePackMeta): void {
  localStorage.setItem(OFFLINE_PACK_META_KEY, JSON.stringify(meta))
}

export type OfflineCacheProgress = {
  done: number
  total: number
  ok: number
}

function isPlaceholderUrl(url: string): boolean {
  return /\/(?:api\/)?media\/placeholders?\//i.test(url)
}

function isSpeciesMediaUrl(url: string): boolean {
  return /\/(?:api\/)?media\/species\//i.test(url)
}

/**
 * Prefetch photo URLs into Cache API (browser only).
 * Writes pack cache + SW runtime caches so NetworkFirst handlers find image assets offline.
 * meta.json is stored in pack (+ species-media) and read via caches.match in fetchSpeciesMediaMeta.
 * Returns number of successfully cached URLs.
 */
export async function cacheOfflinePackPhotos(
  urls: string[],
  cacheName = OFFLINE_PACK_CACHE,
  onProgress?: (p: OfflineCacheProgress) => void,
): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const packCache = await caches.open(cacheName)
  // Align with vite.config workbox cacheNames so SW serves pack image assets offline
  let speciesCache: Cache | null = null
  let placeholderCache: Cache | null = null
  try {
    speciesCache = await caches.open(SW_SPECIES_MEDIA_CACHE)
    placeholderCache = await caches.open(SW_PLACEHOLDER_CACHE)
  } catch {
    /* rare private-mode / missing Cache API partial support */
  }

  let ok = 0
  let done = 0
  const total = urls.length
  const batchSize = 6
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (url) => {
        try {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
          if (res.ok) {
            await packCache.put(url, res.clone())
            // Mirror into SW caches (images + meta for app-side caches.match)
            if (isPlaceholderUrl(url) && placeholderCache) {
              await placeholderCache.put(url, res.clone())
            } else if (speciesCache && isSpeciesMediaUrl(url)) {
              await speciesCache.put(url, res.clone())
            }
            ok += 1
          }
        } catch {
          // ignore individual failures (CORS / offline)
        } finally {
          done += 1
        }
      }),
    )
    onProgress?.({ done, total, ok })
  }
  return ok
}

/**
 * Remove pack cache + delete known pack asset URLs from SW mirrors.
 * Does not wholesale-delete species-media (preserves non-pack navigated assets).
 */
export async function clearOfflinePackCache(cacheName = OFFLINE_PACK_CACHE): Promise<void> {
  const meta = readOfflinePackMeta()
  const urls = offlinePackAssetUrlsFromMeta(meta)

  if (typeof caches !== 'undefined') {
    await caches.delete(cacheName)
    // Targeted SW mirror cleanup — only URLs from this pack
    if (urls.length) {
      try {
        const speciesCache = await caches.open(SW_SPECIES_MEDIA_CACHE)
        const placeholderCache = await caches.open(SW_PLACEHOLDER_CACHE)
        await Promise.all(
          urls.map(async (url) => {
            try {
              await speciesCache.delete(url)
              await placeholderCache.delete(url)
              // Also try relative key if we stored absolute
              if (/^https?:\/\//i.test(url)) {
                try {
                  const path = new URL(url).pathname
                  await speciesCache.delete(path)
                  await placeholderCache.delete(path)
                } catch {
                  /* ignore */
                }
              }
            } catch {
              /* ignore per-url */
            }
          }),
        )
      } catch {
        /* ignore SW cleanup failures */
      }
    }
  }
  try {
    localStorage.removeItem(OFFLINE_PACK_META_KEY)
  } catch {
    /* ignore */
  }
}

/** Whether a pack is considered installed on this device (meta present). */
export function isOfflinePackInstalled(meta?: OfflinePackMeta | null): boolean {
  const m = meta === undefined ? readOfflinePackMeta() : meta
  return Boolean(m && m.count > 0 && m.savedAt > 0)
}

/** Lightweight catalog index for search-first paint (no photo blobs). */
export type CatalogIndexRow = {
  taxon: string
  slug: string
  common_names: string[]
  family: string | null
  family_es: string | null
  risk_label: string
  photo_tier: PhotoTier
}

export function buildCatalogIndex(limit?: number): CatalogIndexRow[] {
  const rows = speciesCatalog.map((s) => ({
    taxon: s.taxon,
    slug: s.slug,
    common_names: s.common_names.slice(0, 4),
    family: s.family ?? null,
    family_es: s.family_es ?? null,
    risk_label: s.risk_label,
    photo_tier: s.photo_tier,
  }))
  return typeof limit === 'number' ? rows.slice(0, limit) : rows
}
