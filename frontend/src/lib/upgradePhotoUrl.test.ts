import { describe, expect, it } from 'vitest'
import { qualityForVariant, upgradePhotoUrl } from './speciesImageService'

describe('upgradePhotoUrl — paint-speed remotes', () => {
  it('converts full Wikimedia commons files to allow-listed thumb sizes', () => {
    const full =
      'https://upload.wikimedia.org/wikipedia/commons/4/40/Pieczarka_polowa_vongrzanka.JPG'
    // Commons rejects non-allowlisted sizes (320/640 → HTTP 400 → "Sin foto real")
    expect(upgradePhotoUrl(full, 'thumb')).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Pieczarka_polowa_vongrzanka.JPG/250px-Pieczarka_polowa_vongrzanka.JPG',
    )
    expect(upgradePhotoUrl(full, 'display')).toContain('/500px-')
    expect(upgradePhotoUrl(full, 'hd')).toContain('/1280px-')
  })

  it('downsizes existing wiki thumbs to allow-listed px (not 320/640)', () => {
    const huge =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Agaricus_augustus_2011_G1.jpg/3840px-Agaricus_augustus_2011_G1.jpg'
    expect(upgradePhotoUrl(huge, 'thumb')).toContain('/250px-')
    expect(upgradePhotoUrl(huge, 'display')).toContain('/500px-')
    expect(upgradePhotoUrl(huge, 'thumb')).not.toContain('/320px-')
    expect(upgradePhotoUrl(huge, 'display')).not.toContain('/640px-')
  })

  it('downgrades iNaturalist large/original to small/medium', () => {
    const large = 'https://static.inaturalist.org/photos/444557876/large.jpeg'
    expect(upgradePhotoUrl(large, 'thumb')).toBe(
      'https://static.inaturalist.org/photos/444557876/small.jpeg',
    )
    expect(upgradePhotoUrl(large, 'display')).toContain('/medium.')
    const original =
      'https://inaturalist-open-data.s3.amazonaws.com/photos/510450459/original.jpg'
    expect(upgradePhotoUrl(original, 'thumb')).toContain('/small.')
  })

  it('leaves data URIs and unknown hosts alone', () => {
    const data = 'data:image/svg+xml,abc'
    expect(upgradePhotoUrl(data, 'thumb')).toBe(data)
    const other = 'https://example.com/photo.jpg'
    expect(upgradePhotoUrl(other, 'display')).toBe(other)
  })

  it('qualityForVariant maps card/thumb → thumb, detail → display', () => {
    expect(qualityForVariant('card')).toBe('thumb')
    expect(qualityForVariant('thumb')).toBe('thumb')
    expect(qualityForVariant('detail')).toBe('display')
    expect(qualityForVariant('hero')).toBe('hd')
  })
})
