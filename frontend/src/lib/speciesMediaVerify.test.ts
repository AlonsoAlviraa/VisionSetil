import { describe, expect, it } from 'vitest'
import { speciesCatalog } from '../data/speciesCatalog'
import {
  inventoryMediaHealth,
  isPlausiblePhotoUrl,
  requiredPlaceholderPaths,
  verifySpeciesMediaCatalog,
} from './speciesMediaVerify'
import {
  isTerminalMediaUrl,
  mediaStackWithTerminal,
  terminalFallbackUrl,
} from './speciesMediaStack'
import { INLINE_PLACEHOLDER_SVG } from './speciesImageUrl'

describe('species media verification', () => {
  it('walks full catalog: every taxon resolves a displayable URL', () => {
    const report = verifySpeciesMediaCatalog(speciesCatalog)
    expect(report.catalogCount).toBeGreaterThanOrEqual(500)
    expect(report.photoStats.mapped).toBeGreaterThan(250)
    expect(report.allResolveOk).toBe(true)
    expect(report.resolveEmpty).toBe(0)
    expect(report.badCatalogUrls).toBe(0)
    expect(report.withLocalPath).toBe(report.catalogCount)
    expect(report.allStacksTerminal).toBe(true)
    expect(report.stackEmpty).toBe(0)
    expect(report.issues.filter((i) => i.code === 'empty_resolve')).toHaveLength(0)
  })

  it('mediaStackWithTerminal always ends with displayable candidate', () => {
    const stack = mediaStackWithTerminal('Amanita phalloides', { riskLabel: 'deadly' })
    expect(stack.length).toBeGreaterThan(2)
    expect(isTerminalMediaUrl(stack[stack.length - 1].url)).toBe(true)
    const unk = mediaStackWithTerminal('Fakeus nonexistentus xyz', { riskLabel: 'unknown' })
    expect(unk.length).toBeGreaterThan(0)
    expect(unk[unk.length - 1].url.startsWith('data:image/')).toBe(true)
  })

  it('maxCandidates slices non-terminal but keeps terminal (UI contract)', () => {
    const stack = mediaStackWithTerminal('Boletus edulis', {
      maxGallery: 4,
      includeCatalog: true,
      maxCandidates: 3,
    })
    // at most 3 non-terminal + 1 terminal
    expect(stack.length).toBeLessThanOrEqual(4)
    expect(isTerminalMediaUrl(stack[stack.length - 1].url)).toBe(true)
    // simulating old bug: slice after terminal would drop SVG — helper forbids that
    const onlyNonTerm = stack.filter((c) => !isTerminalMediaUrl(c.url))
    expect(onlyNonTerm.length).toBeLessThanOrEqual(3)
  })

  it('terminal fallback is SVG data URI (never empty remote)', () => {
    const fb = terminalFallbackUrl('Amanita muscaria', 'poisonous')
    expect(fb.startsWith('data:image/svg+xml')).toBe(true)
    expect(fb.length).toBeGreaterThan(40)
    expect(isPlausiblePhotoUrl(fb)).toBe(true)
    expect(isPlausiblePhotoUrl(INLINE_PLACEHOLDER_SVG)).toBe(true)
    expect(isPlausiblePhotoUrl('javascript:alert(1)')).toBe(false)
    expect(isPlausiblePhotoUrl('https://static.inaturalist.org/photos/1/medium.jpg')).toBe(true)
    expect(isPlausiblePhotoUrl('/media/species/x/card.webp')).toBe(true)
  })

  it('required placeholders use /media/placeholders paths', () => {
    const paths = requiredPlaceholderPaths()
    expect(paths).toHaveLength(4)
    expect(paths.every((p) => p.includes('/placeholders/') && p.endsWith('.webp'))).toBe(true)
  })

  it('offline media health inventory has full resolve coverage (no network)', () => {
    const inv = inventoryMediaHealth(speciesCatalog)
    expect(inv.catalogCount).toBeGreaterThanOrEqual(500)
    expect(inv.resolveCoverage).toBe(1)
    expect(inv.catalogRemoteCoverage).toBeGreaterThan(0.4)
    expect(inv.withLocalPath).toBe(inv.catalogCount)
    expect(inv.issueCount).toBeLessThanOrEqual(200)
  })
})
