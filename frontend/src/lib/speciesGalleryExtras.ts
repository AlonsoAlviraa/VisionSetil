/**
 * Role-tagged open-license gallery extras for multi-photo encyclopedia views.
 * Merged into SpeciesGallery after local/API frames. Attribution required.
 */
import extrasDb from '../data/speciesGalleryExtras.json'
import { scientificNameToSlug } from './slug'

export type GalleryExtraPhoto = {
  role: string
  url: string
  license?: string | null
  creator?: string | null
  attribution_text?: string | null
  source?: string | null
  source_url?: string | null
}

export type SpeciesGalleryExtraBundle = {
  taxon: string
  slug: string
  photos: GalleryExtraPhoto[]
}

type ExtrasFile = {
  version?: string
  policy?: string
  species: Record<string, SpeciesGalleryExtraBundle>
}

const db = extrasDb as ExtrasFile

const ROLE_RANK: Record<string, number> = {
  hero: 100,
  front: 90,
  profile: 88,
  /** Bolete/suillus hymenium — same diagnostic weight as gills */
  pores: 85,
  gills: 85,
  detail: 80,
  habitat: 70,
  group: 65,
  gallery: 60,
}

export function getGalleryExtras(
  slugOrTaxon: string | null | undefined,
): GalleryExtraPhoto[] {
  if (!slugOrTaxon) return []
  const raw = slugOrTaxon.trim()
  if (!raw) return []
  const slug =
    raw.includes(' ') || /[A-Z]/.test(raw) ? scientificNameToSlug(raw) : raw.toLowerCase()
  const entry = db.species?.[slug]
  if (!entry?.photos?.length) return []
  return [...entry.photos].sort(
    (a, b) => (ROLE_RANK[b.role] ?? 50) - (ROLE_RANK[a.role] ?? 50),
  )
}

export function getGalleryExtraBundle(
  slugOrTaxon: string | null | undefined,
): SpeciesGalleryExtraBundle | null {
  if (!slugOrTaxon) return null
  const raw = slugOrTaxon.trim()
  if (!raw) return null
  const slug =
    raw.includes(' ') || /[A-Z]/.test(raw) ? scientificNameToSlug(raw) : raw.toLowerCase()
  return db.species?.[slug] || null
}

export function listGalleryExtraSlugs(): string[] {
  return Object.keys(db.species || {})
}

/** Normalize URL path for dedupe (strip query). */
export function galleryUrlKey(url: string): string {
  return (url || '').split('?')[0].trim().toLowerCase()
}

/**
 * Merge local/API gallery items with open-license extras.
 * Prefer existing items first; append extras with distinct URLs.
 */
export function mergeGalleryWithExtras<T extends { url: string; role?: string }>(
  base: T[],
  extras: GalleryExtraPhoto[],
  mapExtra: (p: GalleryExtraPhoto) => T,
  opts?: { maxTotal?: number },
): T[] {
  const max = opts?.maxTotal ?? 16
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of base) {
    const k = galleryUrlKey(item.url)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(item)
    if (out.length >= max) return out
  }
  for (const p of extras) {
    const k = galleryUrlKey(p.url)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(mapExtra(p))
    if (out.length >= max) break
  }
  return out
}

/** Parse/validate extras file (tests). */
export function parseGalleryExtrasFile(raw: unknown): {
  ok: boolean
  speciesCount: number
  photoCount: number
  errors: string[]
} {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, speciesCount: 0, photoCount: 0, errors: ['not an object'] }
  }
  const file = raw as ExtrasFile
  if (!file.species || typeof file.species !== 'object') {
    return { ok: false, speciesCount: 0, photoCount: 0, errors: ['missing species'] }
  }
  let photoCount = 0
  for (const [slug, entry] of Object.entries(file.species)) {
    if (!entry?.taxon) errors.push(`${slug}: missing taxon`)
    if (!Array.isArray(entry?.photos) || entry.photos.length < 1) {
      errors.push(`${slug}: need photos[]`)
      continue
    }
    for (const p of entry.photos) {
      if (!p.url || !p.role) errors.push(`${slug}: photo missing url/role`)
      if (p.url && !/^https?:\/\//i.test(p.url) && !p.url.startsWith('/')) {
        errors.push(`${slug}: photo url invalid`)
      }
      if (!p.license && !p.attribution_text) {
        errors.push(`${slug}: photo needs license or attribution_text`)
      }
      photoCount += 1
    }
  }
  return {
    ok: errors.length === 0,
    speciesCount: Object.keys(file.species).length,
    photoCount,
    errors,
  }
}
