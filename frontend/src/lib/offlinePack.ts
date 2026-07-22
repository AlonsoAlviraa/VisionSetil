/**
 * Offline pack for España top taxa (S5) — T0 + T1 catalog photo URLs.
 * Pure helpers + Cache API when available. Educational / PWA shell only.
 */
import { loadSpeciesCatalog, speciesCatalog } from '../data/speciesCatalog'

export async function ensureOfflineCatalog() {
  return loadSpeciesCatalog()
}
import { getCatalogPhotoUrl } from './speciesImageService'
import { PHOTO_TIER_T0, getPhotoTier, type PhotoTier } from '../data/photoTiers'

export const OFFLINE_PACK_CACHE = 'visionsetil-offline-pack-v1'
export const OFFLINE_PACK_META_KEY = 'visionsetil_offline_pack_meta'

export type OfflinePackEntry = {
  taxon: string
  slug: string
  common_name: string
  family_es: string | null
  risk_label: string
  photo_tier: PhotoTier
  photo_url: string | null
}

export type OfflinePackMeta = {
  savedAt: number
  count: number
  withPhotos: number
  taxons: string[]
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

function toEntry(s: {
  taxon: string
  slug: string
  common_names: string[]
  family_es?: string | null
  risk_label: string
  photo_tier?: PhotoTier
}): OfflinePackEntry {
  return {
    taxon: s.taxon,
    slug: s.slug,
    common_name: s.common_names[0] || 'Sin nombre común local',
    family_es: s.family_es || null,
    risk_label: s.risk_label,
    photo_tier: s.photo_tier || getPhotoTier(s.taxon, s.risk_label),
    photo_url: getCatalogPhotoUrl(s.taxon),
  }
}

export function offlinePackPhotoUrls(entries: OfflinePackEntry[]): string[] {
  return entries.map((e) => e.photo_url).filter((u): u is string => Boolean(u))
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

/**
 * Prefetch catalog photo URLs into Cache API (browser only).
 * Returns number of successfully cached URLs.
 */
export async function cacheOfflinePackPhotos(
  urls: string[],
  cacheName = OFFLINE_PACK_CACHE,
): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const cache = await caches.open(cacheName)
  let ok = 0
  // Bound concurrency to avoid saturating the network
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
        }
      }),
    )
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
