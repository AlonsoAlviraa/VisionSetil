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
import { getCatalogPhotoUrl } from './speciesImageService'
import { scientificNameToSlug } from './slug'
import { speciesPhotoErrorFallback } from './speciesPhotoFallback'

export type MediaCandidate = {
  url: string
  kind: 'detail' | 'card' | 'thumb' | 'gallery' | 'catalog' | 'lqip'
  /** Higher = show first */
  rank: number
  sameOrigin: boolean
}

/** Iconic taxa with strong local multi-view packs — lead product surfaces. */
export const PREMIUM_PHOTO_SLUGS: readonly string[] = [
  'amanita-phalloides',
  'amanita-muscaria',
  'boletus-edulis',
  'cantharellus-cibarius',
  'lactarius-deliciosus',
  'macrolepiota-procera',
  'amanita-caesarea',
  'galerina-marginata',
  'amanita-virosa',
  'coprinus-comatus',
  'morchella-esculenta',
  'pleurotus-ostreatus',
  'hypholoma-fasciculare',
  'craterellus-cornucopioides',
  'russula-virescens',
  'boletus-aereus',
  'amanita-pantherina',
  'lepiota-brunneoincarnata',
  'cortinarius-rubellus',
  'armillaria-mellea',
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
  opts?: { maxGallery?: number; includeCatalog?: boolean; includeLqip?: boolean },
): MediaCandidate[] {
  const slug = scientificNameToSlug(taxon)
  if (!slug) return []
  const maxG = opts?.maxGallery ?? 4
  const out: MediaCandidate[] = []

  // 1) Hero angles — local same-origin first (security + speed)
  out.push({
    url: speciesImageUrl(slug, 'detail'),
    kind: 'detail',
    rank: 100,
    sameOrigin: true,
  })
  out.push({
    url: speciesImageUrl(slug, 'card'),
    kind: 'card',
    rank: 90,
    sameOrigin: true,
  })

  // 2) Gallery multi-view (01…n) — more angles for study
  for (let i = 1; i <= maxG; i++) {
    out.push({
      url: galleryImageUrl(slug, i),
      kind: 'gallery',
      rank: 80 - i,
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

  // 3) Remote catalog last (medium, not large — bandwidth + less third-party)
  if (opts?.includeCatalog !== false) {
    const cat = getCatalogPhotoUrl(taxon)
    if (cat) {
      out.push({
        url: cat,
        kind: 'catalog',
        rank: 70,
        sameOrigin: false,
      })
    }
  }

  // Stable sort: rank desc, then sameOrigin first
  return out.sort((a, b) => b.rank - a.rank || Number(b.sameOrigin) - Number(a.sameOrigin))
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
  },
): MediaCandidate[] {
  const base = uniqueMediaStack(
    buildSpeciesMediaStack(taxon, {
      maxGallery: opts?.maxGallery ?? 3,
      includeCatalog: opts?.includeCatalog !== false,
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
