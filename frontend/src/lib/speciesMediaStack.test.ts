import { describe, expect, it } from 'vitest'
import {
  MEDIA_SURFACE_POLICY,
  PREMIUM_PHOTO_SLUGS,
  buildSpeciesMediaStack,
  isTerminalMediaUrl,
  mediaStackWithTerminal,
  photoPriorityScore,
  uniqueMediaStack,
} from './speciesMediaStack'

describe('speciesMediaStack', () => {
  it('orders media by rank desc (curated extras/catalog can lead field heroes)', () => {
    const stack = buildSpeciesMediaStack('Amanita phalloides', { maxGallery: 2 })
    expect(stack.length).toBeGreaterThan(3)
    expect(stack.some((c) => c.kind === 'gallery' || c.kind === 'detail')).toBe(true)
    const ranks = stack.map((c) => c.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
  })

  it('prefers gallery-extras hero when curated for popular taxa', () => {
    const stack = buildSpeciesMediaStack('Boletus edulis', {
      maxGallery: 1,
      includeCatalog: true,
    })
    // Boletus has gallery extras — first non-lqip should be extra or catalog (field-realistic)
    const lead = stack[0]
    expect(['extra', 'catalog']).toContain(lead.kind)
    expect(lead.url).toMatch(/^https:\/\//)
  })

  it('returns empty stack for empty / invalid taxon', () => {
    expect(buildSpeciesMediaStack('')).toEqual([])
    expect(buildSpeciesMediaStack('   ')).toEqual([])
  })

  it('respects maxGallery and includeCatalog / includeLqip', () => {
    const noGallery = buildSpeciesMediaStack('Boletus edulis', {
      maxGallery: 0,
      includeCatalog: false,
    })
    expect(noGallery.every((c) => c.kind !== 'gallery')).toBe(true)
    expect(noGallery.every((c) => c.kind !== 'catalog')).toBe(true)
    expect(noGallery.some((c) => c.kind === 'detail')).toBe(true)
    expect(noGallery.some((c) => c.kind === 'card')).toBe(true)

    const withLqip = buildSpeciesMediaStack('Boletus edulis', {
      maxGallery: 1,
      includeCatalog: false,
      includeLqip: true,
    })
    expect(withLqip.some((c) => c.kind === 'lqip')).toBe(true)
    expect(withLqip.filter((c) => c.kind === 'gallery').length).toBe(1)
  })

  it('includes up to maxGallery gallery slots', () => {
    const stack = buildSpeciesMediaStack('Lactarius deliciosus', { maxGallery: 4 })
    const galleries = stack.filter((c) => c.kind === 'gallery')
    expect(galleries.length).toBe(4)
    expect(galleries[0].rank).toBeGreaterThan(galleries[3].rank)
  })

  it('dedupes urls', () => {
    const stack = buildSpeciesMediaStack('Boletus edulis')
    const uniq = uniqueMediaStack([...stack, ...stack])
    expect(uniq.length).toBe(stack.length)
  })

  it('uniqueMediaStack handles empty and query-string variants', () => {
    expect(uniqueMediaStack([])).toEqual([])
    const a = {
      url: '/media/species/x/card.webp?v=1',
      kind: 'card' as const,
      rank: 90,
      sameOrigin: true,
    }
    const b = {
      url: '/media/species/x/card.webp?v=2',
      kind: 'card' as const,
      rank: 90,
      sameOrigin: true,
    }
    expect(uniqueMediaStack([a, b])).toHaveLength(1)
  })

  it('scores premium packs higher than unknown', () => {
    expect(photoPriorityScore('amanita-phalloides')).toBeGreaterThan(
      photoPriorityScore('unknown-slug-xyz'),
    )
    expect(photoPriorityScore('Amanita phalloides')).toBe(
      photoPriorityScore('amanita-phalloides'),
    )
    // First premium slug ranks highest among pack
    const first = PREMIUM_PHOTO_SLUGS[0]
    const last = PREMIUM_PHOTO_SLUGS[PREMIUM_PHOTO_SLUGS.length - 1]
    expect(photoPriorityScore(first)).toBeGreaterThan(photoPriorityScore(last))
    expect(photoPriorityScore(first)).toBe(1000)
  })

  it('same-origin candidates use /media paths', () => {
    const stack = buildSpeciesMediaStack('Cantharellus cibarius', {
      maxGallery: 1,
      includeCatalog: false,
    })
    for (const c of stack) {
      if (c.sameOrigin) {
        expect(c.url.startsWith('/media/') || c.url.includes('/media/')).toBe(true)
      }
    }
  })

  it('mediaStackWithTerminal keeps terminal after maxCandidates', () => {
    const stack = mediaStackWithTerminal('Lactarius deliciosus', {
      maxCandidates: 2,
      maxGallery: 4,
    })
    expect(stack.length).toBe(3)
    expect(isTerminalMediaUrl(stack[stack.length - 1].url)).toBe(true)
  })

  it('MEDIA_SURFACE_POLICY locks grid thumb + preferLocal (T1/T6)', () => {
    const grid = MEDIA_SURFACE_POLICY.encyclopedia_grid
    expect(grid.quality).toBe('thumb')
    expect(grid.preferLocal).toBe(true)
    expect(grid.maxCandidates).toBeLessThanOrEqual(3)
    expect(grid.maxGallery).toBe(0)

    const detail = MEDIA_SURFACE_POLICY.species_detail
    expect(detail.quality).toBe('hd')
    expect(detail.maxCandidates).toBeGreaterThanOrEqual(4)

    const games = MEDIA_SURFACE_POLICY.games_hub
    expect(games.quality).toBe('display')
    expect(games.maxCandidates).toBeLessThanOrEqual(3)

    const lookalike = MEDIA_SURFACE_POLICY.lookalike_compare
    expect(lookalike.quality).toBe('thumb')
    expect(lookalike.maxCandidates).toBeLessThanOrEqual(3)

    // No product_unlock surface / culinary key in media module policy
    const policyJson = JSON.stringify(MEDIA_SURFACE_POLICY)
    expect(policyJson).not.toMatch(/product_unlock|consume|forage/)
  })

  it('encyclopedia_grid policy caps mediaStackWithTerminal length', () => {
    const p = MEDIA_SURFACE_POLICY.encyclopedia_grid
    const stack = mediaStackWithTerminal('Amanita phalloides', {
      maxCandidates: p.maxCandidates,
      maxGallery: p.maxGallery,
      preferLocal: p.preferLocal,
      quality: p.quality,
      includeCatalog: true,
    })
    const nonTerminal = stack.filter((c) => !isTerminalMediaUrl(c.url))
    expect(nonTerminal.length).toBeLessThanOrEqual(p.maxCandidates)
    expect(isTerminalMediaUrl(stack[stack.length - 1].url)).toBe(true)
  })
})
