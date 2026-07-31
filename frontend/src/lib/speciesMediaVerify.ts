/**
 * Automated species media verification (catalog + speciesPhotos + URL shape).
 * Used by unit tests and optional node scripts — no network required.
 * Runtime UI stacks live in speciesMediaStack (mediaStackWithTerminal).
 */
import { speciesCatalog, type CatalogSpecies } from '../data/speciesCatalog'
import {
  catalogPhotoStats,
  getCatalogPhotoUrl,
  resolveSpeciesImageSync,
} from './speciesImageService'
import { placeholderImageUrl, speciesImageUrl } from './speciesImageUrl'
import { scientificNameToSlug } from './slug'
import {
  isTerminalMediaUrl,
  mediaStackWithTerminal,
  terminalFallbackUrl,
} from './speciesMediaStack'

// Re-export runtime helpers for any legacy imports (prefer speciesMediaStack in UI).
export { mediaStackWithTerminal, terminalFallbackUrl, isTerminalMediaUrl }

export type MediaVerifyIssue = {
  taxon: string
  slug: string
  code:
    | 'no_slug'
    | 'empty_resolve'
    | 'bad_catalog_url'
    | 'empty_stack'
    | 'stack_no_terminal'
  detail?: string
}

export type MediaVerifyReport = {
  catalogCount: number
  photoStats: ReturnType<typeof catalogPhotoStats>
  withCatalogUrl: number
  withLocalPath: number
  resolveEmpty: number
  badCatalogUrls: number
  stackEmpty: number
  issues: MediaVerifyIssue[]
  /** True when every taxon resolves a non-empty display URL */
  allResolveOk: boolean
  /** True when every stack has a terminal same-origin or data URI fallback path */
  allStacksTerminal: boolean
}

const BAD_URL_RE = /^(javascript:|data:text\/html)/i

export function isPlausiblePhotoUrl(url: string): boolean {
  if (!url || url.length < 4) return false
  if (BAD_URL_RE.test(url)) return false
  if (url.startsWith('data:image/')) return true
  if (url.startsWith('/media/')) return true
  if (/^https?:\/\//i.test(url)) return true
  return false
}

export function verifySpeciesMediaCatalog(
  list: CatalogSpecies[] = speciesCatalog,
): MediaVerifyReport {
  const issues: MediaVerifyIssue[] = []
  let withCatalogUrl = 0
  let withLocalPath = 0
  let resolveEmpty = 0
  let badCatalogUrls = 0
  let stackEmpty = 0

  for (const s of list) {
    const slug = s.slug || scientificNameToSlug(s.taxon)
    if (!slug) {
      issues.push({ taxon: s.taxon, slug: '', code: 'no_slug' })
      continue
    }

    const cat = getCatalogPhotoUrl(s.taxon)
    if (cat) {
      withCatalogUrl += 1
      if (!isPlausiblePhotoUrl(cat)) {
        badCatalogUrls += 1
        issues.push({
          taxon: s.taxon,
          slug,
          code: 'bad_catalog_url',
          detail: cat.slice(0, 120),
        })
      }
    }

    const local = speciesImageUrl(slug, 'card')
    if (local.startsWith('/media/species/')) withLocalPath += 1

    const resolved = resolveSpeciesImageSync(s.taxon, s.risk_label)
    if (!resolved.url || resolved.url.length < 10) {
      resolveEmpty += 1
      issues.push({ taxon: s.taxon, slug, code: 'empty_resolve' })
    } else if (!isPlausiblePhotoUrl(resolved.url) && !resolved.url.startsWith('data:')) {
      issues.push({
        taxon: s.taxon,
        slug,
        code: 'empty_resolve',
        detail: 'implausible ' + resolved.url.slice(0, 80),
      })
      resolveEmpty += 1
    }

    // maxCandidates:5 mirrors UI reels — terminal must still be present
    const stack = mediaStackWithTerminal(s.taxon, {
      riskLabel: s.risk_label,
      maxCandidates: 5,
    })
    if (stack.length === 0) {
      stackEmpty += 1
      issues.push({ taxon: s.taxon, slug, code: 'empty_stack' })
    } else {
      const hasTerminal = stack.some((c) => isTerminalMediaUrl(c.url))
      if (!hasTerminal) {
        issues.push({ taxon: s.taxon, slug, code: 'stack_no_terminal' })
      }
    }
  }

  const capped = issues.slice(0, 200)

  return {
    catalogCount: list.length,
    photoStats: catalogPhotoStats(),
    withCatalogUrl,
    withLocalPath,
    resolveEmpty,
    badCatalogUrls,
    stackEmpty,
    issues: capped,
    allResolveOk: resolveEmpty === 0,
    allStacksTerminal: !issues.some(
      (i) => i.code === 'stack_no_terminal' || i.code === 'empty_stack',
    ),
  }
}

/** Static paths that must exist for brand fallbacks (checked by optional FS scripts). */
export function requiredPlaceholderPaths(): string[] {
  return (['default', 'toxic', 'deadly', 'unknown'] as const).map((k) =>
    placeholderImageUrl(k),
  )
}

/**
 * Offline media health inventory (v1.27) — no network, no harvest.
 * Summarizes catalog coverage for ops dashboards / graph residual P3/P6.
 */
export type MediaHealthInventory = {
  catalogCount: number
  withCatalogRemoteUrl: number
  withLocalPath: number
  resolveOk: number
  stacksTerminal: number
  issueCount: number
  issueCodes: Record<string, number>
  /** Share of taxa with a remote catalog URL (Wiki/iNat style). */
  catalogRemoteCoverage: number
  /** Share that resolve a display URL offline. */
  resolveCoverage: number
  generatedAt: string
}

export function inventoryMediaHealth(
  list: CatalogSpecies[] = speciesCatalog,
): MediaHealthInventory {
  const report = verifySpeciesMediaCatalog(list)
  const issueCodes: Record<string, number> = {}
  for (const i of report.issues) {
    issueCodes[i.code] = (issueCodes[i.code] || 0) + 1
  }
  const n = Math.max(report.catalogCount, 1)
  return {
    catalogCount: report.catalogCount,
    withCatalogRemoteUrl: report.withCatalogUrl,
    withLocalPath: report.withLocalPath,
    resolveOk: report.catalogCount - report.resolveEmpty,
    stacksTerminal: report.allStacksTerminal
      ? report.catalogCount
      : report.catalogCount - (issueCodes.stack_no_terminal || 0) - (issueCodes.empty_stack || 0),
    issueCount: report.issues.length,
    issueCodes,
    catalogRemoteCoverage: report.withCatalogUrl / n,
    resolveCoverage: (report.catalogCount - report.resolveEmpty) / n,
    generatedAt: new Date().toISOString(),
  }
}
