/** Canonical public media URL helper — prefers static /media (Vite serves repo media/). */

import { scientificNameToSlug } from './slug'
import { canonicalTaxonName } from './taxonSynonyms'

export type SpeciesImageVariant = 'thumb' | 'card' | 'detail' | 'lqip'
export type PlaceholderKind = 'default' | 'toxic' | 'deadly' | 'unknown'

/**
 * Browser-facing media prefix.
 * Default `/media` is served by Vite from the monorepo media/ folder (no backend required for photos).
 * Override with VITE_MEDIA_PUBLIC_PREFIX=/api/media if you only proxy through FastAPI.
 */
export function mediaPublicPrefix(): string {
  const raw = import.meta.env.VITE_MEDIA_PUBLIC_PREFIX
  if (raw !== undefined && String(raw).length > 0) {
    return String(raw).replace(/\/$/, '')
  }
  return '/media'
}

export function normalizeSlug(slugOrScientific: string): string {
  if (!slugOrScientific) return ''
  if (slugOrScientific.includes(' ')) {
    // Resolve curated synonyms so photos join SSOT media paths
    return scientificNameToSlug(canonicalTaxonName(slugOrScientific))
  }
  // Slug form of a known synonym (e.g. coprinopsis-atramentaria)
  const asName = slugOrScientific.replace(/-/g, ' ')
  const canon = canonicalTaxonName(asName)
  if (canon.toLowerCase() !== asName.toLowerCase()) {
    return scientificNameToSlug(canon)
  }
  return slugOrScientific.toLowerCase().trim()
}

export function speciesImageUrl(
  slugOrScientific: string,
  variant: SpeciesImageVariant = 'card',
  opts?: { v?: string },
): string {
  const slug = normalizeSlug(slugOrScientific)
  const base = `${mediaPublicPrefix()}/species/${encodeURIComponent(slug)}/${variant}.webp`
  if (opts?.v) return `${base}?v=${encodeURIComponent(opts.v)}`
  return base
}

export function placeholderImageUrl(kind: PlaceholderKind = 'default'): string {
  const safe: PlaceholderKind = ['default', 'toxic', 'deadly', 'unknown'].includes(kind)
    ? kind
    : 'default'
  // Repo layout uses media/placeholders/* (plural). Keep singular alias for caches.
  return `${mediaPublicPrefix()}/placeholders/${safe}.webp`
}

export function galleryImageUrl(slug: string, index: number): string {
  const n = String(Math.max(1, index)).padStart(2, '0')
  return `${mediaPublicPrefix()}/species/${encodeURIComponent(normalizeSlug(slug))}/gallery/${n}.webp`
}

/** Inline branded SVG last-resort (0 network) — flat plate, no mushroom 3D shape. */
export const INLINE_PLACEHOLDER_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1a221b"/>
          <stop offset="100%" stop-color="#101511"/>
        </linearGradient>
      </defs>
      <rect width="480" height="360" fill="url(#g)"/>
      <circle cx="240" cy="150" r="36" fill="none" stroke="rgba(170,216,169,0.35)" stroke-width="2"/>
      <text x="240" y="210" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" fill="rgba(223,228,221,0.7)">Foto de campo no disponible</text>
      <text x="240" y="236" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="rgba(143,188,143,0.75)">VisionSetil · solo orientación</text>
    </svg>`,
  )
