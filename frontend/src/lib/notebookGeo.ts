/**
 * Private notebook map pins — local coords only.
 * Policy: EXIF stripped / never stored as raw blobs · no marketplace · orientation only.
 */

export type NotebookPinSource = 'gps' | 'manual'

export type NotebookPin = {
  lat: number
  lng: number
  accuracy_m?: number | null
  source: NotebookPinSource
  /** Explicit privacy stamp — coords only, no EXIF payload */
  privacy: 'coords_only_no_exif'
  captured_at?: number
}

/** Spain-ish bbox soft guard (still allows nearby Iberia / border). */
export const PIN_LAT_MIN = 27
export const PIN_LAT_MAX = 44.5
export const PIN_LNG_MIN = -19
export const PIN_LNG_MAX = 5.5

export const NOTEBOOK_GEO_POLICY_ES =
  'Pin local privado: solo lat/lng (sin EXIF). No se sube a un mapa público ni autoriza recolección.'

export const NOTEBOOK_GEO_POLICY_EN =
  'Private local pin: lat/lng only (no EXIF). Not uploaded to a public map and never authorizes foraging.'

export function notebookGeoPolicy(locale?: string): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  return en ? NOTEBOOK_GEO_POLICY_EN : NOTEBOOK_GEO_POLICY_ES
}

/** One row in the private notebook pin table (local only · not marketplace). */
export type NotebookPinListItem = {
  entryId: string
  pin: NotebookPin
  /** Top prediction species if any — orientation hint only */
  speciesHint: string | null
  timestamp: number
  source: NotebookPinSource
}

export type NotebookPinSummary = {
  total: number
  gps: number
  manual: number
}

/** Minimal entry shape so callers need not import full HistoryEntry. */
export type NotebookPinSourceEntry = {
  id: string
  timestamp: number
  pin?: unknown
  result?: {
    predictions?: Array<{ species?: string | null } | null> | null
  } | null
}

/**
 * Build a privacy-safe pin table from notebook entries.
 * Newest first. Skips entries without a stamped pin. Never includes EXIF.
 */
export function listNotebookPinsFromEntries(
  entries: NotebookPinSourceEntry[],
): NotebookPinListItem[] {
  const out: NotebookPinListItem[] = []
  for (const e of entries) {
    if (!isNotebookPin(e.pin)) continue
    const top = e.result?.predictions?.[0]?.species
    const speciesHint =
      typeof top === 'string' && top.trim().length > 0 ? top.trim() : null
    out.push({
      entryId: e.id,
      pin: e.pin,
      speciesHint,
      timestamp: e.timestamp,
      source: e.pin.source,
    })
  }
  return out.sort((a, b) => b.timestamp - a.timestamp)
}

export function summarizeNotebookPins(items: NotebookPinListItem[]): NotebookPinSummary {
  let gps = 0
  let manual = 0
  for (const i of items) {
    if (i.source === 'gps') gps += 1
    else manual += 1
  }
  return { total: items.length, gps, manual }
}

/**
 * Plain-text export of private pins (coords only).
 * Safe to share as local notes — never embeds EXIF or public map upload.
 */
export function notebookPinsShareText(
  items: NotebookPinListItem[],
  locale?: string,
): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const header = en
    ? 'VisionSetil private pins (local · no EXIF · orientation only)'
    : 'VisionSetil pins privados (local · sin EXIF · solo orientación)'
  if (items.length === 0) {
    return en ? `${header}\n(none)` : `${header}\n(ninguno)`
  }
  const lines = items.map((row, idx) => {
    const sp = row.speciesHint || (en ? 'unknown' : 'desconocida')
    const coords = formatNotebookPin(row.pin, locale)
    const src = row.source === 'gps' ? 'GPS' : en ? 'manual' : 'manual'
    return `${idx + 1}. ${sp} · ${coords} · ${src}`
  })
  return [header, notebookGeoPolicy(locale), ...lines].join('\n')
}

export function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Normalize user/GPS coords into a privacy-safe pin.
 * Rejects NaN, out-of-range extremes; never keeps EXIF blobs.
 */
export function sanitizeNotebookPin(input: {
  lat: number
  lng: number
  accuracy_m?: number | null
  source?: NotebookPinSource
  captured_at?: number
  /** Ignored on purpose — EXIF never stored */
  exifBlob?: unknown
}): NotebookPin | null {
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  if (!isFiniteCoord(lat) || !isFiniteCoord(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  // Soft Iberia window: allow slightly outside but drop polar nonsense
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null

  let accuracy_m: number | null | undefined = input.accuracy_m
  if (accuracy_m != null) {
    const a = Number(accuracy_m)
    accuracy_m = Number.isFinite(a) && a >= 0 && a < 50_000 ? Math.round(a) : null
  }

  // Explicitly discard any EXIF-shaped payload (defense in depth)
  void input.exifBlob

  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    accuracy_m: accuracy_m ?? null,
    source: input.source === 'manual' ? 'manual' : 'gps',
    privacy: 'coords_only_no_exif',
    captured_at: input.captured_at ?? Date.now(),
  }
}

export function isNotebookPin(value: unknown): value is NotebookPin {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.privacy !== 'coords_only_no_exif') return false
  if (v.source !== 'gps' && v.source !== 'manual') return false
  return isFiniteCoord(v.lat) && isFiniteCoord(v.lng)
}

/** Short display: "41.1234°, −2.5678° (±12 m)" */
export function formatNotebookPin(pin: NotebookPin, locale?: string): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const lat = pin.lat.toFixed(4)
  const lng = pin.lng.toFixed(4)
  const acc =
    pin.accuracy_m != null && pin.accuracy_m > 0
      ? en
        ? ` (±${pin.accuracy_m} m)`
        : ` (±${pin.accuracy_m} m)`
      : ''
  return `${lat}°, ${lng}°${acc}`
}

/** OpenStreetMap link (user opens externally — we don't host pins). */
export function notebookPinMapHref(pin: NotebookPin): string {
  return `https://www.openstreetmap.org/?mlat=${pin.lat}&mlon=${pin.lng}#map=15/${pin.lat}/${pin.lng}`
}

/**
 * Browser geolocation → sanitized pin.
 * Never reads photo EXIF; GPS only when user grants permission.
 */
export function requestBrowserNotebookPin(
  options: { timeoutMs?: number; maximumAgeMs?: number } = {},
): Promise<NotebookPin | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  const timeout = options.timeoutMs ?? 12_000
  const maximumAge = options.maximumAgeMs ?? 60_000
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pin = sanitizeNotebookPin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          source: 'gps',
          captured_at: Date.now(),
          exifBlob: undefined,
        })
        resolve(pin)
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge },
    )
  })
}

/** Manual lat/lng text parse ("41.12, -2.55" or "41.12 -2.55"). */
export function parseManualPinInput(raw: string): NotebookPin | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/;/g, ',')
  const m = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  return sanitizeNotebookPin({
    lat: Number(m[1]),
    lng: Number(m[2]),
    source: 'manual',
    captured_at: Date.now(),
  })
}
