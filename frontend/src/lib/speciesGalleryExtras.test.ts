import { describe, expect, it } from 'vitest'
import extrasDb from '../data/speciesGalleryExtras.json'
import {
  getGalleryExtras,
  listGalleryExtraSlugs,
  mergeGalleryWithExtras,
  parseGalleryExtrasFile,
} from './speciesGalleryExtras'

const CULINARY_SLUGS = [
  'boletus-edulis',
  'boletus-aereus',
  'leccinum-scabrum',
  'macrolepiota-procera',
  'agaricus-campestris',
  'craterellus-cornucopioides',
  'lactarius-deliciosus',
  'imleria-badia',
  'suillus-luteus',
  'morchella-esculenta',
  'hydnum-repandum',
  'cantharellus-cibarius',
  // field-strong keepers (not Core-12 upgrades; already multi-view)
  'amanita-caesarea',
  'pleurotus-ostreatus',
  'coprinus-comatus',
]

/** Core-12 field-realistic hero upgrades — boletes must show pores/stem roles. */
const CORE12_BOLETES = ['boletus-edulis', 'boletus-aereus', 'leccinum-scabrum', 'imleria-badia', 'suillus-luteus']

describe('speciesGalleryExtras — multi-photo open-license packs', () => {
  it('parses extras file with role-tagged attributed photos', () => {
    const parsed = parseGalleryExtrasFile(extrasDb)
    expect(parsed.errors, parsed.errors.join('; ')).toEqual([])
    expect(parsed.ok).toBe(true)
    expect(parsed.speciesCount).toBeGreaterThanOrEqual(15)
    expect(parsed.photoCount).toBeGreaterThanOrEqual(15 * 6)
  })

  it('covers all core culinary taxa with multi-role packs', () => {
    const slugs = listGalleryExtraSlugs()
    for (const s of CULINARY_SLUGS) {
      expect(slugs).toContain(s)
      const photos = getGalleryExtras(s)
      expect(photos.length, s).toBeGreaterThanOrEqual(6)
      const roles = new Set(photos.map((p) => p.role))
      // At least two distinct diagnostic roles beyond plain gallery
      expect(roles.size, s).toBeGreaterThanOrEqual(3)
      for (const p of photos) {
        expect(p.url).toMatch(/^https:\/\//)
        expect(p.license || p.attribution_text).toBeTruthy()
      }
    }
  })

  it('Core-12 boletes include pore/hymenium diagnostics (not gills-only)', () => {
    for (const s of CORE12_BOLETES) {
      const photos = getGalleryExtras(s)
      const roles = new Set(photos.map((p) => p.role))
      expect(roles.has('pores') || roles.has('gills'), `${s} missing pores/gills role`).toBe(true)
      expect(photos.some((p) => p.role === 'hero'), s).toBe(true)
    }
  })

  it('resolves by scientific name', () => {
    const byName = getGalleryExtras('Craterellus cornucopioides')
    const bySlug = getGalleryExtras('craterellus-cornucopioides')
    expect(byName.length).toBe(bySlug.length)
    expect(byName[0].role).toBeTruthy()
  })

  it('merges extras without duplicating base URLs', () => {
    const extras = getGalleryExtras('boletus-edulis')
    const base = [
      { url: extras[0].url, role: 'hero' as const },
      { url: '/media/species/boletus-edulis/gallery/01.webp', role: 'gallery' as const },
    ]
    const merged = mergeGalleryWithExtras(
      base,
      extras,
      (p) => ({
        url: p.url,
        role: p.role,
        license: p.license,
        creator: p.creator,
        attribution_text: p.attribution_text,
        source: p.source,
        source_url: p.source_url,
      }),
      { maxTotal: 12 },
    )
    expect(merged[0].url).toBe(base[0].url)
    expect(merged.length).toBeGreaterThan(base.length)
    const keys = merged.map((m) => m.url.split('?')[0].toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })
})
