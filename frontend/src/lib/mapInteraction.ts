/**
 * Pure helpers for map interactivity (M2).
 * Deep-link parse, zone search, top hotspots, nearest zone, grid clustering.
 * Educational map only — not forage permission.
 */

export type MapDeepLink = {
  zoneId: string | null
  region: string | null
  /** Free-text search (`?q=`) */
  query: string | null
}

/** Canonical CCAA aliases (co-official / alternate labels → inventory label). */
const REGION_ALIASES: Record<string, string> = {
  'comunitat valenciana': 'Comunidad Valenciana',
  'comunidad valenciana': 'Comunidad Valenciana',
  'illes balears': 'Islas Baleares',
  'islas baleares': 'Islas Baleares',
  catalunya: 'Cataluña',
  cataluna: 'Cataluña',
  euskadi: 'País Vasco',
  'pais vasco': 'País Vasco',
  'castilla y leon': 'Castilla y León',
  castilla: 'Castilla y León',
  aragon: 'Aragón',
  nafarroa: 'Navarra',
  galiza: 'Galicia',
  andalucia: 'Andalucía',
}

/** Parse `/mapa?zone=…&region=…&q=…` search string (with or without leading `?`). */
export function parseMapSearchParams(search: string): MapDeepLink {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  const zoneRaw = params.get('zone')?.trim() || null
  const regionRaw = params.get('region')?.trim() || null
  const queryRaw = params.get('q')?.trim() || null
  return {
    zoneId: zoneRaw && zoneRaw.length > 0 ? zoneRaw : null,
    region: regionRaw && regionRaw.length > 0 ? regionRaw : null,
    query: queryRaw && queryRaw.length > 0 ? queryRaw : null,
  }
}

/** Build query string for map deep-link (no leading `?`). Omits empty keys. */
export function buildMapSearchParams(opts: {
  zoneId?: string | null
  region?: string | null
  query?: string | null
}): string {
  const params = new URLSearchParams()
  if (opts.zoneId) params.set('zone', opts.zoneId)
  if (opts.region && opts.region !== 'todas') params.set('region', opts.region)
  if (opts.query && opts.query.trim()) params.set('q', opts.query.trim())
  return params.toString()
}

/**
 * Update browser URL with replaceState (keeps history stack clean).
 * Safe no-op outside the browser.
 */
export function replaceMapUrl(opts: {
  zoneId?: string | null
  region?: string | null
  query?: string | null
  pathname?: string
}): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  const path = opts.pathname ?? window.location.pathname
  const qs = buildMapSearchParams({
    zoneId: opts.zoneId,
    region: opts.region,
    query: opts.query,
  })
  const next = qs ? `${path}?${qs}` : path
  const current = `${window.location.pathname}${window.location.search}`
  if (next === current) return
  window.history.replaceState(null, '', next)
}

export type MapDeepLinkBootstrap = {
  /** Resolved zone id when found in catalog */
  zoneId: string | null
  /** Raw `zone` param when id was present but not found */
  zoneMissing: string | null
  /** CCAA filter or `todas` */
  filterRegion: string
  /** Free-text search (e.g. province deep-link) */
  searchQuery: string
  /**
   * Region param to keep in URL when not a CCAA match (province)
   * or the matched CCAA name while that filter is active.
   */
  stickyRegion: string | null
}

/**
 * Resolve deep-link query into initial map UI state (pure — no DOM).
 * Used for lazy `useState` so first paint matches URL (avoids replaceState race).
 */
export function resolveMapDeepLink(
  search: string,
  zones: readonly { id: string }[],
  regions: readonly string[],
): MapDeepLinkBootstrap {
  const { zoneId: rawZone, region: rawRegion, query: rawQuery } = parseMapSearchParams(search)
  let filterRegion = 'todas'
  let searchQuery = rawQuery ?? ''
  let stickyRegion: string | null = null

  if (rawRegion) {
    const matched = matchRegionFilter(regions, rawRegion)
    if (matched) {
      filterRegion = matched
      stickyRegion = matched
    } else if (!searchQuery) {
      // Province / free-text (e.g. Soria) when no explicit `q`
      searchQuery = rawRegion
      stickyRegion = rawRegion
    } else {
      stickyRegion = rawRegion
    }
  }

  let zoneId: string | null = null
  let zoneMissing: string | null = null
  if (rawZone) {
    const found = findZoneById(zones, rawZone)
    if (found) zoneId = found.id
    else zoneMissing = rawZone
  }

  return { zoneId, zoneMissing, filterRegion, searchQuery, stickyRegion }
}

/**
 * Keep sticky region URL param only while free-text search still matches it.
 * Empty search or diverging query clears sticky (avoids leak after clear / near-me).
 */
export function stickyRegionAfterSearchChange(
  sticky: string | null,
  searchQuery: string,
): string | null {
  if (!sticky) return null
  const q = normalizeSearchText(searchQuery)
  if (!q) return null
  const s = normalizeSearchText(sticky)
  if (q === s || q.includes(s) || s.includes(q)) return sticky
  return null
}

export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export type ZoneSearchFields = {
  id: string
  name: string
  region: string
  provinces: string[]
  habitat: string
  description?: string
  season?: string
}

/** Free-text filter: name, region, provinces, habitat, id, optional description/season. */
export function filterZonesByQuery<T extends ZoneSearchFields>(
  zones: T[],
  query: string,
): T[] {
  const q = normalizeSearchText(query)
  if (!q) return zones
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return zones
  return zones.filter((z) => {
    const hay = normalizeSearchText(
      [
        z.id,
        z.name,
        z.region,
        z.habitat,
        z.description ?? '',
        z.season ?? '',
        ...(z.provinces ?? []),
      ].join(' '),
    )
    return tokens.every((t) => hay.includes(t))
  })
}

export function findZoneById<T extends { id: string }>(
  zones: readonly T[],
  id: string | null | undefined,
): T | null {
  if (!id) return null
  const needle = id.trim().toLowerCase()
  if (!needle) return null
  return zones.find((z) => z.id.toLowerCase() === needle) ?? null
}

/**
 * Match a region query against known region labels (case/diacritic insensitive).
 * Returns the canonical region string from the list, or null.
 * Supports co-official aliases (Comunitat Valenciana, Illes Balears, Catalunya…).
 */
export function matchRegionFilter(
  regions: readonly string[],
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  const needle = normalizeSearchText(raw)
  if (!needle || needle === 'todas' || needle === 'all') return null

  const aliasTarget = REGION_ALIASES[needle]
  if (aliasTarget) {
    const hit = regions.find(
      (r) => r !== 'todas' && normalizeSearchText(r) === normalizeSearchText(aliasTarget),
    )
    if (hit) return hit
    // Alias canonical not in list yet — return target if any region includes it
    for (const r of regions) {
      if (r === 'todas') continue
      if (normalizeSearchText(r) === normalizeSearchText(aliasTarget)) return r
    }
  }

  // Exact first
  for (const r of regions) {
    if (r === 'todas') continue
    if (normalizeSearchText(r) === needle) return r
  }
  // Prefix / includes (e.g. "Castilla" matches "Castilla y León")
  for (const r of regions) {
    if (r === 'todas') continue
    const n = normalizeSearchText(r)
    if (n.includes(needle) || needle.includes(n)) return r
  }
  return null
}

/**
 * Search suggestions for typeahead: name / region / province hits.
 * Pure helper — UI caps display length.
 */
export function suggestZonesByQuery<T extends ZoneSearchFields>(
  zones: readonly T[],
  query: string,
  limit = 8,
): T[] {
  const q = normalizeSearchText(query)
  if (!q || q.length < 2) return []
  const scored: Array<{ z: T; score: number }> = []
  for (const z of zones) {
    const name = normalizeSearchText(z.name)
    const region = normalizeSearchText(z.region)
    const prov = normalizeSearchText((z.provinces ?? []).join(' '))
    let score = 0
    if (name.startsWith(q)) score = 100
    else if (name.includes(q)) score = 80
    else if (region.startsWith(q) || region.includes(q)) score = 60
    else if (prov.includes(q)) score = 50
    else if (normalizeSearchText(z.id).includes(q)) score = 40
    else if (normalizeSearchText(z.habitat).includes(q)) score = 20
    if (score > 0) scored.push({ z, score })
  }
  scored.sort((a, b) => b.score - a.score || a.z.name.localeCompare(b.z.name, 'es'))
  return scored.slice(0, limit).map((s) => s.z)
}

export type TopHotspot = { id: string; score: number }

/** Top N zones by live score (desc). Null/NaN scores excluded. */
export function topHotspotsByScore(
  zoneIds: readonly string[],
  scores: Record<string, number | null | undefined>,
  limit = 5,
): TopHotspot[] {
  const rows: TopHotspot[] = []
  for (const id of zoneIds) {
    const s = scores[id]
    if (s == null || Number.isNaN(s)) continue
    rows.push({ id, score: s })
  }
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return rows.slice(0, Math.max(0, limit))
}

const EARTH_KM = 6371

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function nearestZone<T extends { lat: number; lng: number }>(
  zones: readonly T[],
  lat: number,
  lng: number,
): T | null {
  if (!zones.length) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let best: T | null = null
  let bestD = Infinity
  for (const z of zones) {
    const d = haversineKm(lat, lng, z.lat, z.lng)
    if (d < bestD) {
      bestD = d
      best = z
    }
  }
  return best
}

/** Default zoom below which markers cluster (M2.2). */
export const CLUSTER_BELOW_ZOOM = 7

export type Clusterable = { id: string; lat: number; lng: number }

export type MapClusterPoint = {
  type: 'point'
  id: string
  zoneId: string
  lat: number
  lng: number
}

export type MapClusterGroup = {
  type: 'cluster'
  id: string
  lat: number
  lng: number
  count: number
  zoneIds: string[]
}

export type MapCluster = MapClusterPoint | MapClusterGroup

/**
 * Lightweight grid clustering when zoomed out.
 * No extra deps — groups zones into lat/lng buckets sized by zoom.
 * At zoom >= clusterBelowZoom, returns individual points.
 */
export function clusterZones(
  zones: readonly Clusterable[],
  zoom: number,
  opts?: { clusterBelowZoom?: number },
): MapCluster[] {
  const threshold = opts?.clusterBelowZoom ?? CLUSTER_BELOW_ZOOM
  if (zoom >= threshold || zones.length === 0) {
    return zones.map((z) => ({
      type: 'point' as const,
      id: z.id,
      zoneId: z.id,
      lat: z.lat,
      lng: z.lng,
    }))
  }

  // Coarser grid at lower zoom: cell size ~ degrees
  // zoom 6 → ~1.5°, zoom 5 → ~2.5°, zoom 4 → ~4°, zoom 3 → ~6°
  const cell = Math.max(0.6, 12 / Math.max(1, zoom + 1))
  const buckets = new Map<string, Clusterable[]>()

  for (const z of zones) {
    const gx = Math.floor(z.lng / cell)
    const gy = Math.floor(z.lat / cell)
    const key = `${gx}:${gy}`
    const list = buckets.get(key)
    if (list) list.push(z)
    else buckets.set(key, [z])
  }

  const out: MapCluster[] = []
  for (const [key, members] of buckets) {
    if (members.length === 1) {
      const z = members[0]
      out.push({
        type: 'point',
        id: z.id,
        zoneId: z.id,
        lat: z.lat,
        lng: z.lng,
      })
      continue
    }
    let latSum = 0
    let lngSum = 0
    const zoneIds: string[] = []
    for (const m of members) {
      latSum += m.lat
      lngSum += m.lng
      zoneIds.push(m.id)
    }
    const n = members.length
    out.push({
      type: 'cluster',
      id: `c-${key}`,
      lat: latSum / n,
      lng: lngSum / n,
      count: n,
      zoneIds,
    })
  }
  return out
}

/** Wrap keyboard focus index for zone board navigation. */
export function nextBoardIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return -1
  if (current < 0) return delta >= 0 ? 0 : length - 1
  return (current + delta + length * 100) % length
}
