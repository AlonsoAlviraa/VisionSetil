/**
 * Pure gallery planner tests (audit T2) — no Image() probe storm.
 */
import { describe, expect, it } from 'vitest'
import { buildStaticGallery } from './SpeciesGallery'

describe('buildStaticGallery (T2 no probe storm)', () => {
  it('returns a single hero candidate (detail/card/thumb only)', () => {
    const items = buildStaticGallery('amanita-phalloides')
    expect(items).toHaveLength(1)
    expect(items[0].role).toBe('hero')
    expect(items[0].url).toMatch(/\/media\/species\/amanita-phalloides\//)
    // Must not invent gallery_1..8 URLs
    expect(items.every((i) => !/gallery[_-]?\d/i.test(i.url))).toBe(true)
  })

  it('never emits multi-slot gallery probe list', () => {
    const items = buildStaticGallery('boletus-edulis')
    expect(items.length).toBeLessThanOrEqual(2)
    const urls = items.flatMap((i) => [i.url, i.thumb_url || ''])
    for (const u of urls) {
      expect(u).not.toMatch(/gallery[_/]0*[2-9]/)
    }
  })
})
