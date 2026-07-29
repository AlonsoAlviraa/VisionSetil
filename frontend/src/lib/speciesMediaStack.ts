/**
 * Ordered media candidates for a taxon — best/safe first.
 * Preference: same-origin WebP (fast + no third-party referrer) → catalog remote HD.
 * Terminal SVG always available via mediaStackWithTerminal (UI onError defense).
 */
import {
  galleryImageUrl,
  INLINE_PLACEHOLDER_SVG,
  mediaPublicPrefix,
  speciesImageUrl,
} from './speciesImageUrl'
import {
  getCatalogPhotoUrl,
  upgradePhotoUrl,
  type PhotoDisplayQuality,
} from './speciesImageService'
import { getGalleryExtras } from './speciesGalleryExtras'
import { scientificNameToSlug } from './slug'
import { speciesPhotoErrorFallback } from './speciesPhotoFallback'

export type MediaCandidate = {
  url: string
  kind: 'detail' | 'card' | 'thumb' | 'gallery' | 'catalog' | 'lqip' | 'extra'
  /** Higher = show first */
  rank: number
  sameOrigin: boolean
  /** Diagnostic role when from gallery extras (pores/gills/habitat/…) */
  role?: string
}

/**
 * Iconic taxa with strong photo packs — lead product surfaces.
 * Popular culinary/search icons first so encyclopedia + flashcards paint recognizable heroes.
 */
export const PREMIUM_PHOTO_SLUGS: readonly string[] = [
  'boletus-edulis',
  'cantharellus-cibarius',
  'lactarius-deliciosus',
  'amanita-caesarea',
  'macrolepiota-procera',
  'pleurotus-ostreatus',
  'agaricus-campestris',
  'morchella-esculenta',
  'amanita-phalloides',
  'amanita-muscaria',
  'boletus-aereus',
  'craterellus-cornucopioides',
  'hydnum-repandum',
  'coprinus-comatus',
  'galerina-marginata',
  'amanita-virosa',
  'hypholoma-fasciculare',
  'russula-virescens',
  'amanita-pantherina',
  'lepiota-brunneoincarnata',
  'cortinarius-rubellus',
  'armillaria-mellea',
  'imleria-badia',
  'suillus-luteus',
]

export function photoPriorityScore(slugOrTaxon: string): number {
  const slug = scientificNameToSlug(slugOrTaxon) || slugOrTaxon.toLowerCase()
  const i = PREMIUM_PHOTO_SLUGS.indexOf(slug)
  if (i >= 0) return 1000 - i
  // Prefer taxa with catalog remote photo
  if (getCatalogPhotoUrl(slugOrTaxon.replace(/-/g, ' '))) return 100
  return 0
}

/**
 * Build ordered stack: good multi-angle first, then lighter, then remote catalog.
 * Client skips broken URLs via onError cascade in the flashcard component.
 */
export function buildSpeciesMediaStack(
  taxon: string,
  opts?: {
    maxGallery?: number
    includeCatalog?: boolean
    includeLqip?: boolean
    /** Remote size for catalog/extras (grid should use thumb). */
    quality?: PhotoDisplayQuality
  },
): MediaCandidate[] {
  const slug = scientificNameToSlug(taxon)
  if (!slug) return []
  const maxG = opts?.maxGallery ?? 4
  const quality: PhotoDisplayQuality = opts?.quality ?? 'thumb'
  const out: MediaCandidate[] = []

  // 0) Field-realistic open-license extras FIRST when curated (fixes weak local heroes)
  const extras = getGalleryExtras(slug)
  extras.forEach((p, idx) => {
    const roleBoost =
      p.role === 'hero' ? 120 : p.role === 'front' ? 115 : p.role === 'gills' ? 112 : 100
    out.push({
      url: upgradePhotoUrl(p.url, quality),
      kind: 'extra',
      rank: roleBoost - Math.min(idx, 15),
      sameOrigin: false,
      role: p.role,
    })
  })

  // 1) Remote catalog (speciesPhotos.json / Wiki / iNat) — resized for paint speed
  if (opts?.includeCatalog !== false) {
    const cat = getCatalogPhotoUrl(taxon) || getCatalogPhotoUrl(slug.replace(/-/g, ' '))
    if (cat) {
      out.push({
        url: upgradePhotoUrl(cat, quality),
        kind: 'catalog',
        // Above extras default (100) and local pack so product surfaces show real photos
        rank: 130,
        sameOrigin: false,
      })
    }
  }

  // 2) Local same-origin pack (fallback when catalog blocked / offline)
  out.push({
    url: speciesImageUrl(slug, 'detail'),
    kind: 'detail',
    rank: 90,
    sameOrigin: true,
  })
  out.push({
    url: speciesImageUrl(slug, 'card'),
    kind: 'card',
    rank: 85,
    sameOrigin: true,
  })

  // 3) Local gallery multi-view (01…n)
  for (let i = 1; i <= maxG; i++) {
    out.push({
      url: galleryImageUrl(slug, i),
      kind: 'gallery',
      rank: 75 - i,
      sameOrigin: true,
    })
  }

  out.push({
    url: speciesImageUrl(slug, 'thumb'),
    kind: 'thumb',
    rank: 40,
    sameOrigin: true,
  })

  if (opts?.includeLqip) {
    out.push({
      url: `${mediaPublicPrefix()}/species/${encodeURIComponent(slug)}/lqip.webp`,
      kind: 'lqip',
      rank: 10,
      sameOrigin: true,
    })
  }

  // Stable sort: rank desc, then sameOrigin first; drop duplicate URLs (catalog==extra hero)
  return uniqueMediaStack(
    out.sort((a, b) => b.rank - a.rank || Number(b.sameOrigin) - Number(a.sameOrigin)),
  )
}

/** Deduplicate by URL path */
export function uniqueMediaStack(stack: MediaCandidate[]): MediaCandidate[] {
  const seen = new Set<string>()
  const out: MediaCandidate[] = []
  for (const c of stack) {
    const key = c.url.split('?')[0]
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/** Terminal fallback always available for UI (never broken img loop). */
export function terminalFallbackUrl(taxon: string, risk?: string | null): string {
  return speciesPhotoErrorFallback(taxon, risk) || INLINE_PLACEHOLDER_SVG
}

export function isTerminalMediaUrl(url: string): boolean {
  return (
    url.startsWith('data:image/') ||
    url.includes('/placeholders/') ||
    url.startsWith('data:image/svg')
  )
}

/**
 * Ensure media stack ends with a guaranteed displayable candidate.
 * Slice **before** terminal so UI maxFrames never drops the SVG.
 *
 * @param opts.maxCandidates — max non-terminal entries (terminal always appended after)
 */
export function mediaStackWithTerminal(
  taxon: string,
  opts?: {
    maxGallery?: number
    includeCatalog?: boolean
    riskLabel?: string | null
    /** Max non-terminal candidates before appending terminal */
    maxCandidates?: number
    /** Remote size — default thumb for encyclopedia grids */
    quality?: PhotoDisplayQuality
  },
): MediaCandidate[] {
  const base = uniqueMediaStack(
    buildSpeciesMediaStack(taxon, {
      maxGallery: opts?.maxGallery ?? 3,
      includeCatalog: opts?.includeCatalog !== false,
      quality: opts?.quality ?? 'thumb',
    }),
  )
  const limited =
    opts?.maxCandidates != null && opts.maxCandidates > 0
      ? base.slice(0, opts.maxCandidates)
      : base

  const fb = terminalFallbackUrl(taxon, opts?.riskLabel)
  const withoutTerminal = limited.filter((c) => !isTerminalMediaUrl(c.url) && c.url !== fb)
  return [
    ...withoutTerminal,
    {
      url: fb,
      kind: 'thumb',
      rank: -100,
      sameOrigin: true,
    },
  ]
}
