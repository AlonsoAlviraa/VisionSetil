import { beforeAll, describe, expect, it } from 'vitest'
import { loadSpeciesCatalog } from '../data/speciesCatalog'
import {
  collectSsotLookalikeNames,
  lookalikeSummary,
  lookalikeSummaryForIdentify,
  rankLookalikes,
  rankLookalikesForIdentify,
  rankLookalikesHydrated,
  summarizeLookalikes,
} from './lookalikeRisk'
import { FORBIDDEN_CONSUMPTION_PHRASES } from './riskLabels'

beforeAll(async () => {
  await loadSpeciesCatalog()
})

describe('lookalikeRisk hydration (B-34)', () => {
  it('hydrates Amanita phalloides with deadly risk + catalog fields', async () => {
    const ranked = await rankLookalikesHydrated(['Amanita phalloides', 'Boletus edulis'])
    expect(ranked.length).toBe(2)

    const deadly = ranked[0]
    expect(deadly.name.toLowerCase()).toContain('amanita')
    expect(deadly.risk_label).toBe('deadly')
    expect(deadly.score).toBe(100)
    expect(deadly.in_catalog).toBe(true)
    expect(deadly.slug).toMatch(/amanita-phalloides/i)
    expect(deadly.risk_placeholder).toBe('deadly')
    // Vernaculars when present in SSOT
    expect(Array.isArray(deadly.common_names)).toBe(true)
  })

  it('ranks deadly before lower risk', async () => {
    const ranked = await rankLookalikesHydrated([
      'Boletus edulis',
      'Amanita phalloides',
      'Unknownus fakeus',
    ])
    expect(ranked[0].risk_label).toBe('deadly')
    expect(ranked.some((r) => !r.in_catalog && r.name.includes('Unknownus'))).toBe(true)
  })

  it('summary counts deadly and high risk', async () => {
    const ranked = await rankLookalikesHydrated(['Amanita phalloides', 'Galerina marginata'])
    const sum = summarizeLookalikes(ranked)
    expect(sum.total).toBe(2)
    expect(sum.deadly).toBeGreaterThanOrEqual(1)
    expect(sum.top?.risk_label).toBe('deadly')
  })

  it('sync rank works after catalog load (no food labels)', () => {
    const ranked = rankLookalikes(['Amanita phalloides'])
    expect(ranked[0]?.in_catalog).toBe(true)
    const blob = JSON.stringify(ranked)
    for (const phrase of FORBIDDEN_CONSUMPTION_PHRASES) {
      expect(blob.toLowerCase()).not.toContain(phrase.toLowerCase())
    }
    // No food_class / edible chrome in ranked payload
    expect(blob).not.toMatch(/food_class|excelente|buen_comestible/i)
  })

  it('lookalikeSummary matches summarizeLookalikes', () => {
    const names = ['Amanita phalloides']
    expect(lookalikeSummary(names)).toEqual(summarizeLookalikes(rankLookalikes(names)))
  })

  it('dedupes case-insensitive names', () => {
    const ranked = rankLookalikes(['Amanita phalloides', 'amanita phalloides', '  '])
    expect(ranked.length).toBe(1)
  })

  it('resolves Coprinopsis atramentaria alias to SSOT Coprinus atramentarius', () => {
    const ranked = rankLookalikes(['Coprinopsis atramentaria'])
    expect(ranked.length).toBe(1)
    expect(ranked[0]!.name).toBe('Coprinus atramentarius')
    expect(ranked[0]!.in_catalog).toBe(true)
  })

  it('collects SSOT lookalikes for predicted taxa (B-43 FE)', () => {
    const names = collectSsotLookalikeNames(['Amanita caesarea'])
    expect(names.length).toBeGreaterThan(0)
    expect(names.some((n) => /phalloides/i.test(n))).toBe(true)
    // Does not include the prediction itself
    expect(names.every((n) => n.toLowerCase() !== 'amanita caesarea')).toBe(true)
  })

  it('rankLookalikesForIdentify fills empty API list from SSOT', () => {
    const ranked = rankLookalikesForIdentify([], ['Amanita caesarea'])
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked.some((r) => /phalloides/i.test(r.name))).toBe(true)
    const sum = lookalikeSummaryForIdentify([], ['Amanita caesarea'])
    expect(sum.total).toBe(ranked.length)
  })

  it('rankLookalikesForIdentify unions API + SSOT without dupes', () => {
    const ranked = rankLookalikesForIdentify(
      ['Amanita phalloides', 'Amanita phalloides'],
      ['Amanita caesarea'],
    )
    const phallo = ranked.filter((r) => /phalloides/i.test(r.name))
    expect(phallo.length).toBe(1)
  })

  it('dedupes synonym + canonical as one lookalike', () => {
    const ranked = rankLookalikes([
      'Coprinopsis atramentaria',
      'Coprinus atramentarius',
    ])
    expect(ranked.length).toBe(1)
  })
})
