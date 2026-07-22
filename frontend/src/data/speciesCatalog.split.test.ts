/**
 * Catalog code-split: loadSpeciesCatalog is the shipped entry; yields non-empty set.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  isCatalogLoaded,
  loadSpeciesCatalog,
  searchSpecies,
  speciesCatalog,
  speciesCatalogMeta,
} from './speciesCatalog'
import { searchCatalogRanked } from '../lib/catalogSearch'

describe('speciesCatalog code-split loader', () => {
  beforeAll(async () => {
    await loadSpeciesCatalog()
  })

  it('loads a non-empty catalog via dynamic import path', async () => {
    const list = await loadSpeciesCatalog()
    expect(list.length).toBeGreaterThan(100)
    expect(isCatalogLoaded()).toBe(true)
    expect(speciesCatalog.length).toBe(list.length)
    expect(speciesCatalogMeta.count).toBe(list.length)
    expect(speciesCatalogMeta.loaded).toBe(true)
  })

  it('search still works after async load', () => {
    const hits = searchSpecies('amanita', 10)
    expect(hits.length).toBeGreaterThan(0)
    const ranked = searchCatalogRanked(speciesCatalog, { query: 'níscalo', limit: 5 })
    expect(ranked.length).toBeGreaterThan(0)
  })

  it('idempotent second load returns same length', async () => {
    const a = await loadSpeciesCatalog()
    const b = await loadSpeciesCatalog()
    expect(a.length).toBe(b.length)
  })
})
