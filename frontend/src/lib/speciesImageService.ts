/**
 * Unified mycology image resolver (Phase A).
 * Order: local /media WebP → speciesPhotos.json → (optional) live Wiki/iNat → SVG placeholder.
 */
import photosDb from '../data/speciesPhotos.json'
import { mycologyPlaceholderDataUri } from '../data/mycologyPlaceholder'
import {
  getPhotoTier,
  shouldAllowRemotePhotoResolve,
  shouldUseCatalogUrlOnGrid,
  type ImageLoadContext,
  type PhotoTier,
} from '../data/photoTiers'
import { speciesImageUrl } from './speciesImageUrl'
import { scientificNameToSlug } from './slug'

export type PhotoProvider =
  | 'local_media'
  | 'catalog'
  | 'wikipedia'
  | 'inaturalist'
  | 'placeholder'

export type PhotoDisplayQuality = 'thumb' | 'display' | 'hd'

export type ResolvedSpeciesImage = {
  url: string
  provider: PhotoProvider
  taxon: string
  tier: PhotoTier
}

export type ResolveImageOptions = {
  riskLabel?: string
  /** Load context — grid never hits wiki/iNat; T2 grid never uses catalog URL. */
  context?: ImageLoadContext
  /** Override tier (otherwise derived from taxon + risk). */
  tier?: PhotoTier
  /**
   * When true (default for detail/eager), allow async wiki/iNat if no catalog hit.
   * Explicit false forces no remote resolve regardless of context.
   */
  allowNetwork?: boolean
  /** Remote resize quality (grid defaults to thumb). */
  quality?: PhotoDisplayQuality
}

type PhotoEntry = { taxon: string; url: string; provider?: string }
type PhotosFile = {
  version?: string
  photos: Record<string, PhotoEntry>
  stats?: { with_photo?: number; total?: number; missing?: number }
}

const db = photosDb as PhotosFile
const runtimeCache = new Map<string, ResolvedSpeciesImage>()

export function catalogPhotoStats() {
  return {
    version: db.version || 'unknown',
    mapped: Object.keys(db.photos || {}).length,
    total: db.stats?.total,
    with_photo: db.stats?.with_photo,
    missing: db.stats?.missing,
  }
}

export function getCatalogPhotoUrl(taxon: string): string | null {
  const key = taxon.trim().toLowerCase()
  const entry = db.photos?.[key]
  return entry?.url || null
}

/**
 * Wiki thumb widths — MUST be on Commons' allow-list or upload returns HTTP 400
 * ("Use thumbnail sizes listed on https://w.wiki/GHai").
 * Allowed set includes: 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, …
 * Never use 320/640 — those 400 and the UI falls through to "Sin foto real".
 */
const WIKI_PX: Record<PhotoDisplayQuality, number> = {
  thumb: 250,
  display: 500,
  hd: 1280,
}

const INAT_SIZE: Record<PhotoDisplayQuality, string> = {
  thumb: 'small',
  display: 'medium',
  hd: 'large',
}

/**
 * Resize remote photo URLs for the product surface.
 * - iNaturalist: large/original → small|medium|large
 * - Wikimedia full files → /thumb/…/{N}px-… (critical: 136 catalog entries are full originals)
 * - Existing wiki thumbs → swap pixel width
 * Default `display` is medium/640px (fast paint, still sharp on retina cards).
 */
export function upgradePhotoUrl(
  url: string,
  quality: PhotoDisplayQuality = 'display',
): string {
  if (!url || url.startsWith('data:')) return url
  let u = url
  const inatSize = INAT_SIZE[quality] || 'medium'
  const wikiPx = WIKI_PX[quality] || 640

  // iNaturalist static + open-data S3: …/photos/ID/(square|small|medium|large|original).ext
  u = u.replace(
    /\/(square|small|medium|large|original|thumb)\.(jpe?g|png|webp|gif)/gi,
    `/${inatSize}.$2`,
  )

  if (u.includes('upload.wikimedia.org')) {
    if (/\/\d+px-/.test(u)) {
      u = u.replace(/\/\d+px-/g, `/${wikiPx}px-`)
    } else {
      // Full commons file → generated thumb (avoids multi-MB downloads)
      // https://upload.wikimedia.org/wikipedia/commons/a/ab/File.jpg
      // → …/commons/thumb/a/ab/File.jpg/640px-File.jpg
      const m = u.match(
        /^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(?!thumb\/)([0-9a-f]\/[0-9a-f]{2}\/)([^?#]+)/i,
      )
      if (m) {
        const [, base, hashPath, filename] = m
        // SVG/PDF/etc. either don't need thumbs or use different endpoints
        if (!/\.(svg|gif|pdf|djvu|tiff?|ogg|ogv|webm)$/i.test(filename)) {
          u = `${base}/thumb/${hashPath}${filename}/${wikiPx}px-${filename}`
        }
      }
    }
  }
  return u
}

/** Catalog URL at chosen quality (default display = medium/640). */
export function getCatalogPhotoUrlHd(
  taxon: string,
  quality: PhotoDisplayQuality = 'display',
): string | null {
  const raw = getCatalogPhotoUrl(taxon)
  return raw ? upgradePhotoUrl(raw, quality) : null
}

/**
 * Quality hint from product surface.
 * grid/card/thumb → thumb; detail/eager → display; explicit hero → hd.
 */
export function qualityForVariant(
  variant: 'thumb' | 'card' | 'detail' | 'lqip' | 'hero' | string,
): PhotoDisplayQuality {
  if (variant === 'hero') return 'hd'
  if (variant === 'detail') return 'display'
  if (variant === 'thumb' || variant === 'card' || variant === 'lqip') return 'thumb'
  return 'display'
}

function resolveTier(taxon: string, opts?: ResolveImageOptions): PhotoTier {
  return opts?.tier ?? getPhotoTier(taxon, opts?.riskLabel)
}

function cacheKey(
  taxon: string,
  context: ImageLoadContext,
  tier: PhotoTier,
  quality: PhotoDisplayQuality = 'display',
): string {
  return `${taxon.toLowerCase()}|${context}|${tier}|${quality}`
}

/**
 * Sync resolve: catalog (when allowed) or placeholder.
 * Never performs network I/O.
 */
export function resolveSpeciesImageSync(
  taxon: string,
  riskLabelOrOpts?: string | ResolveImageOptions,
): ResolvedSpeciesImage {
  const opts: ResolveImageOptions =
    typeof riskLabelOrOpts === 'string' || riskLabelOrOpts === undefined
      ? { riskLabel: riskLabelOrOpts, context: 'eager' }
      : riskLabelOrOpts

  const name = (taxon || '').trim() || 'Fungi'
  const context: ImageLoadContext = opts.context ?? 'eager'
  const tier = resolveTier(name, opts)
  // Grid/list always request thumb-sized remotes for paint speed.
  const quality: PhotoDisplayQuality =
    opts.quality ?? (context === 'grid' ? 'thumb' : 'display')
  const key = cacheKey(name, context, tier, quality)

  // Only reuse cache for non-placeholder hits (safe across contexts)
  const cached = runtimeCache.get(key)
  if (cached && (cached.provider === 'catalog' || cached.provider === 'local_media')) {
    return cached
  }

  // Prefer real catalog photos when policy allows (many local cards are stubs).
  // T2 grid must never leak remote catalog (photoTiers policy).
  const allowCatalog =
    context !== 'grid' || shouldUseCatalogUrlOnGrid(tier)
  const catalogHd = allowCatalog ? getCatalogPhotoUrlHd(name, quality) : null

  if (catalogHd) {
    const r: ResolvedSpeciesImage = {
      url: catalogHd,
      provider: 'catalog',
      taxon: name,
      tier,
    }
    runtimeCache.set(key, r)
    return r
  }

  // Same-origin /media derivatives (ok_real or vite stub_fallback → placeholder)
  const slug = scientificNameToSlug(name)
  if (slug) {
    const localUrl = speciesImageUrl(slug, context === 'grid' ? 'card' : 'detail')
    const rLocal: ResolvedSpeciesImage = {
      url: localUrl,
      provider: 'local_media',
      taxon: name,
      tier,
    }
    runtimeCache.set(key, rLocal)
    return rLocal
  }

  return {
    url: mycologyPlaceholderDataUri(name, opts.riskLabel),
    provider: 'placeholder',
    taxon: name,
    tier,
  }
}

/** @internal exposed for tests — real network functions used by async path */
export const __remoteResolvers = {
  fetchWiki,
  fetchInat,
  /** Test double: replace to assert no network */
  enabled: true as boolean,
}

async function fetchWiki(name: string, lang: string): Promise<string | null> {
  if (!__remoteResolvers.enabled) return null
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      name.replace(/ /g, '_'),
    )}?redirect=true`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (String(data.type || '').includes('not_found')) return null
    const original = data.originalimage?.source as string | undefined
    const thumb = data.thumbnail?.source as string | undefined
    if (original) return original
    if (thumb) return thumb.replace(/\/\d+px-/, '/1280px-')
    return null
  } catch {
    return null
  }
}

async function fetchInat(name: string): Promise<string | null> {
  if (!__remoteResolvers.enabled) return null
  try {
    const q = new URLSearchParams({
      q: name,
      is_active: 'true',
      rank: 'species',
      per_page: '6',
    })
    const res = await fetch(`https://api.inaturalist.org/v1/taxa?${q}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const results = (data.results || []) as Array<{
      name?: string
      iconic_taxon_name?: string
      default_photo?: { medium_url?: string; url?: string; square_url?: string }
    }>
    const exact = results.find((t) => (t.name || '').toLowerCase() === name.toLowerCase())
    const candidates = exact ? [exact, ...results] : results
    for (const t of candidates) {
      const icon = (t.iconic_taxon_name || '').toLowerCase()
      if (icon && icon !== 'fungi' && icon !== 'protozoa') continue
      const p = t.default_photo
      const u = p?.medium_url || p?.url || p?.square_url
      if (u) return upgradePhotoUrl(u)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Whether async path is allowed to call wiki/iNat for this resolve.
 * Pure policy used by tests and the async function.
 */
export function canAsyncRemoteResolve(opts: {
  tier: PhotoTier
  context: ImageLoadContext
  allowNetwork?: boolean
  alreadyCatalog: boolean
}): boolean {
  if (opts.alreadyCatalog) return false
  if (opts.allowNetwork === false) return false
  // Grid path never calls wiki/iNat — even if allowNetwork was left default
  if (opts.context === 'grid') return false
  return shouldAllowRemotePhotoResolve(opts.tier, opts.context)
}

/**
 * Async resolve with optional network fallback.
 * Grid context never calls wiki/iNat; T2 grid stays on placeholder.
 */
export async function resolveSpeciesImageAsync(
  taxon: string,
  riskLabelOrOpts?: string | ResolveImageOptions,
): Promise<ResolvedSpeciesImage> {
  const opts: ResolveImageOptions =
    typeof riskLabelOrOpts === 'string' || riskLabelOrOpts === undefined
      ? { riskLabel: riskLabelOrOpts, context: 'eager' }
      : riskLabelOrOpts

  const name = (taxon || '').trim() || 'Fungi'
  const context: ImageLoadContext = opts.context ?? 'eager'
  const tier = resolveTier(name, { ...opts, tier: opts.tier })
  const sync = resolveSpeciesImageSync(name, { ...opts, context, tier })

  // Local media or verified catalog — do not upgrade to flaky wiki/iNat
  if (sync.provider === 'catalog' || sync.provider === 'local_media') return sync

  const allow = canAsyncRemoteResolve({
    tier,
    context,
    allowNetwork: opts.allowNetwork,
    alreadyCatalog: false,
  })

  if (!allow) return sync

  const asyncQuality: PhotoDisplayQuality =
    opts.quality ?? (context === 'grid' ? 'thumb' : 'display')

  for (const lang of ['en', 'es'] as const) {
    const wiki = await __remoteResolvers.fetchWiki(name, lang)
    if (wiki) {
      const r: ResolvedSpeciesImage = {
        url: upgradePhotoUrl(wiki, asyncQuality),
        provider: 'wikipedia',
        taxon: name,
        tier,
      }
      runtimeCache.set(cacheKey(name, context, tier, asyncQuality), r)
      return r
    }
  }
  const inat = await __remoteResolvers.fetchInat(name)
  if (inat) {
    const r: ResolvedSpeciesImage = {
      url: upgradePhotoUrl(inat, asyncQuality),
      provider: 'inaturalist',
      taxon: name,
      tier,
    }
    runtimeCache.set(cacheKey(name, context, tier, asyncQuality), r)
    return r
  }
  return sync
}

/** Hero shots only from verified catalog photos of real mushrooms (T0 preferred). */
export function mycologyHeroUrls(
  limit = 6,
  quality: PhotoDisplayQuality = 'display',
): string[] {
  const urls: string[] = []
  const preferred = [
    'amanita muscaria',
    'amanita phalloides',
    'boletus edulis',
    'cantharellus cibarius',
    'macrolepiota procera',
    'morchella esculenta',
    'coprinus comatus',
    'pleurotus ostreatus',
    'lactarius deliciosus',
    'hypholoma fasciculare',
  ]
  for (const k of preferred) {
    const u = db.photos?.[k]?.url
    if (u) urls.push(upgradePhotoUrl(u, quality))
    if (urls.length >= limit) break
  }
  if (urls.length < limit) {
    for (const entry of Object.values(db.photos || {})) {
      if (!entry.url) continue
      const upgraded = upgradePhotoUrl(entry.url, quality)
      if (!urls.includes(upgraded)) urls.push(upgraded)
      if (urls.length >= limit) break
    }
  }
  if (urls.length === 0) {
    urls.push(mycologyPlaceholderDataUri('Amanita muscaria', 'poisonous'))
  }
  return urls
}

/** Clear runtime cache (tests). */
export function clearSpeciesImageCache() {
  runtimeCache.clear()
}
