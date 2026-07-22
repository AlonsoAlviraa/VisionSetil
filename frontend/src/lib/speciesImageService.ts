/**
 * Unified mycology image resolver.
 * Order: verified speciesPhotos.json → (optional) live Wiki/iNat → SVG placeholder.
 * Photo tiers gate network upgrades and grid catalog usage (Week 1).
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

export type PhotoProvider = 'catalog' | 'wikipedia' | 'inaturalist' | 'placeholder'

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

function resolveTier(taxon: string, opts?: ResolveImageOptions): PhotoTier {
  return opts?.tier ?? getPhotoTier(taxon, opts?.riskLabel)
}

function cacheKey(taxon: string, context: ImageLoadContext, tier: PhotoTier): string {
  return `${taxon.toLowerCase()}|${context}|${tier}`
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
  const key = cacheKey(name, context, tier)

  // Only reuse cache for non-placeholder catalog hits (safe across contexts)
  const cached = runtimeCache.get(key)
  if (cached && cached.provider === 'catalog') return cached

  const catalog = getCatalogPhotoUrl(name)
  const allowCatalog =
    context !== 'grid' || shouldUseCatalogUrlOnGrid(tier)

  if (catalog && allowCatalog) {
    const r: ResolvedSpeciesImage = {
      url: catalog,
      provider: 'catalog',
      taxon: name,
      tier,
    }
    runtimeCache.set(key, r)
    return r
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
      if (u) return u.replace('/square.', '/medium.').replace('/small.', '/medium.')
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

  if (sync.provider === 'catalog') return sync

  const allow = canAsyncRemoteResolve({
    tier,
    context,
    allowNetwork: opts.allowNetwork,
    alreadyCatalog: false,
  })

  if (!allow) return sync

  for (const lang of ['en', 'es'] as const) {
    const wiki = await __remoteResolvers.fetchWiki(name, lang)
    if (wiki) {
      const r: ResolvedSpeciesImage = {
        url: wiki,
        provider: 'wikipedia',
        taxon: name,
        tier,
      }
      runtimeCache.set(cacheKey(name, context, tier), r)
      return r
    }
  }
  const inat = await __remoteResolvers.fetchInat(name)
  if (inat) {
    const r: ResolvedSpeciesImage = {
      url: inat,
      provider: 'inaturalist',
      taxon: name,
      tier,
    }
    runtimeCache.set(cacheKey(name, context, tier), r)
    return r
  }
  return sync
}

/** Hero shots only from verified catalog photos of real mushrooms (T0 preferred). */
export function mycologyHeroUrls(limit = 6): string[] {
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
    if (u) urls.push(u)
    if (urls.length >= limit) break
  }
  if (urls.length < limit) {
    for (const entry of Object.values(db.photos || {})) {
      if (entry.url && !urls.includes(entry.url)) urls.push(entry.url)
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
