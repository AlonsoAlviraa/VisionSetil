import { describe, expect, it } from 'vitest'
import { mediaPublicPrefix, placeholderImageUrl, speciesImageUrl } from './speciesImageUrl'
import { scientificNameToSlug, isValidSlug } from './slug'
import { riskToPlaceholder } from './edibility'

describe('speciesImageUrl', () => {
  it('uses /media prefix by default (static Vite serve)', () => {
    expect(mediaPublicPrefix()).toBe('/media')
    expect(speciesImageUrl('amanita-phalloides', 'card')).toBe(
      '/media/species/amanita-phalloides/card.webp',
    )
  })

  it('slugifies scientific names', () => {
    expect(speciesImageUrl('Amanita phalloides', 'thumb')).toContain(
      '/species/amanita-phalloides/thumb.webp',
    )
  })

  it('builds placeholder urls with .webp for Workbox', () => {
    expect(placeholderImageUrl('deadly')).toBe('/media/placeholder/deadly.webp')
  })
})

describe('slug + risk helpers', () => {
  it('validates slugs', () => {
    expect(scientificNameToSlug('Boletus edulis')).toBe('boletus-edulis')
    expect(isValidSlug('amanita-phalloides')).toBe(true)
    expect(isValidSlug('../etc/passwd')).toBe(false)
  })

  it('maps risk to placeholder kind', () => {
    expect(riskToPlaceholder('deadly')).toBe('deadly')
    expect(riskToPlaceholder('high')).toBe('toxic')
    expect(riskToPlaceholder(undefined, 'mortifero')).toBe('deadly')
  })
})
