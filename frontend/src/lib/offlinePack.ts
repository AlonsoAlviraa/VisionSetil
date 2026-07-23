/**
 * Offline pack for España (S5 + Phase D-14) — season pack + T0/T1 priority.
 * Pure helpers + Cache API when available. Educational / PWA shell only.
 * Does not classify offline.
 */
import { loadSpeciesCatalog, speciesCatalog } from '../data/speciesCatalog'
import { getCatalogPhotoUrl } from './speciesImageService'
import { PHOTO_TIER_T0, getPhotoTier, type PhotoTier } from '../data/photoTiers'
import {
  currentSeason,
  taxaForSeasonFromPack,
  type SeasonId,
} from './seasonRadar'
import { speciesImageUrl } from './speciesImageUrl'

export async function ensureOfflineCatalog() {
  return loadSpeciesCatalog()
}

export const OFFLINE_PACK_CACHE = 'visionsetil-offline-pack-v1'
export const OFFLINE_PACK_META_KEY = 'visionsetil_offline_pack_meta'

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
 * D-14: season pack offline list (sync, no full catalog required for taxa list).
 * Uses same-origin /media URLs + placeholders for missing art.
 */
export function buildSeasonOfflinePackEntries(
  seasonId?: SeasonId,
  limit = 16,
): OfflinePackEntry[] {
  const id = seasonId ?? (currentSeason().id as SeasonId)
  const taxa = taxaForSeasonFromPack(id, limit)
  return taxa.map((t) => {
    const card = t.urls?.card || t.urls?.thumb || speciesImageUrl(t.slug, 'card')
    const placeholder = t.placeholder_kind
      ? `/media/placeholders/${t.placeholder_kind}.webp`
      : '/media/placeholders/default.webp'
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

/**
 * Prefetch photo URLs into Cache API (browser only).
 * Returns number of successfully cached URLs.
 * onProgress fires after each batch for UI progress (D-14).
 */
export async function cacheOfflinePackPhotos(
  urls: string[],
  cacheName = OFFLINE_PACK_CACHE,
  onProgress?: (p: OfflineCacheProgress) => void,
): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const cache = await caches.open(cacheName)
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
            await cache.put(url, res.clone())
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

export async function clearOfflinePackCache(cacheName = OFFLINE_PACK_CACHE): Promise<void> {
  if (typeof caches !== 'undefined') {
    await caches.delete(cacheName)
  }
  try {
    localStorage.removeItem(OFFLINE_PACK_META_KEY)
  } catch {
    /* ignore */
  }
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
