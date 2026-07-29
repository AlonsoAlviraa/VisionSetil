import { describe, expect, it } from 'vitest'
import {
  isValidSlug,
  looksLikeScientificName,
  normalizeSlugParam,
  scientificNameToSlug,
} from './slug'

describe('scientificNameToSlug', () => {
  it('handles multi-word taxa', () => {
    expect(scientificNameToSlug('Amanita phalloides')).toBe('amanita-phalloides')
    expect(scientificNameToSlug('Lactarius deliciosus')).toBe('lactarius-deliciosus')
  })

  it('strips accents and special punctuation', () => {
    expect(scientificNameToSlug('Boletus édulis')).toBe('boletus-edulis')
    expect(scientificNameToSlug("Caesar's test")).toBe('caesars-test')
    expect(scientificNameToSlug('  Amanita   muscaria  ')).toBe('amanita-muscaria')
  })

  it('never returns undefined tokens / empty for real names', () => {
    expect(scientificNameToSlug('Amanita phalloides')).toBeTruthy()
    expect(scientificNameToSlug('')).toBe('')
    expect(scientificNameToSlug('undefined')).toBe('undefined')
  })

  it('decodes URL-encoded scientific names', () => {
    expect(scientificNameToSlug('Amanita%20phalloides')).toBe('amanita-phalloides')
  })
})

describe('normalizeSlugParam / round-trip', () => {
  it('normalizes slug and scientific forms to the same key', () => {
    expect(normalizeSlugParam('amanita-phalloides')).toBe('amanita-phalloides')
    expect(normalizeSlugParam('Amanita phalloides')).toBe('amanita-phalloides')
    expect(normalizeSlugParam('Amanita%20phalloides')).toBe('amanita-phalloides')
  })

  it('looksLikeScientificName detects spaces and capitals', () => {
    expect(looksLikeScientificName('Amanita phalloides')).toBe(true)
    expect(looksLikeScientificName('amanita-phalloides')).toBe(false)
  })

  it('isValidSlug rejects empty and junk', () => {
    expect(isValidSlug('amanita-phalloides')).toBe(true)
    expect(isValidSlug('amanita')).toBe(true) // single segment ok
    expect(isValidSlug('')).toBe(false)
    expect(isValidSlug('Amanita phalloides')).toBe(false)
    expect(isValidSlug('--bad--')).toBe(false)
  })
})
