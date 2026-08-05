/**
 * UX-06 contracts: encyclopedia/seasonal thumb quality + risk filter SSOT.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

function readSrc(rel: string) {
  return readFileSync(resolve(root, 'src', rel), 'utf8')
}

describe('UX-06 encyclopedia thumbs + risk SSOT', () => {
  it('SeasonalTopStrip uses quality thumb (not display/hd)', () => {
    const src = readSrc('components/SeasonalTopStrip.tsx')
    expect(src).toMatch(/quality=["']thumb["']/)
    expect(src).not.toMatch(/quality=["']display["']/)
    expect(src).not.toMatch(/quality=["']hd["']/)
  })

  it('SpeciesPhotoCard defaults grid quality via encyclopedia_grid policy (thumb)', () => {
    const src = readSrc('components/SpeciesPhotoCard.tsx')
    expect(src).toMatch(/encyclopedia_grid/)
    expect(src).toMatch(/data-photo-quality=\{quality\}/)
    // Default path uses policy.quality (thumb) unless priority upgrades display
    expect(src).toMatch(/priority \? 'display' : policy\.quality/)
  })

  it('Encyclopedia risk filters keep poisonous≠toxic SSOT (Venenosa / Tóxica)', () => {
    const page = readSrc('pages/EncyclopediaPage.tsx')
    expect(page).toMatch(/id:\s*'poisonous'/)
    expect(page).toMatch(/id:\s*'toxic'/)
    expect(page).toMatch(/risk\.poisonous/)
    expect(page).toMatch(/risk\.toxic/)
    // Must not collapse poisonous label into Tóxica-only filter id
    expect(page).toMatch(/Venenosa/)
    expect(page).toMatch(/Tóxica/)
  })

  it('LookalikeCompare opens studio with focus=current & peer=mate', () => {
    const src = readSrc('components/LookalikeCompare.tsx')
    expect(src).toMatch(/\/lookalikes\?focus=/)
    expect(src).toMatch(/&peer=/)
    expect(src).toMatch(/MEDIA_SURFACE_POLICY\.lookalike_compare/)
    // quality comes from policy (thumb), not a bare hardcode drift path only
    expect(src).toMatch(/quality=\{photoQuality\}|quality=["']thumb["']/)
  })
})
