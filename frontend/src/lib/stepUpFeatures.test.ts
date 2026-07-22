import { describe, expect, it } from 'vitest'
import {
  assessMultiViewReadiness,
  buildViewTypesOrder,
  CANONICAL_VIEWS,
  nextCameraSlot,
  orderedSlotKeys,
  resolveCameraTargetSlot,
} from './multiViewSlots'
import { hasHighRiskLookalike, lookalikeSummary, rankLookalikes } from './lookalikeRisk'
import {
  appendHistory,
  clearHistoryStore,
  entriesNeedingReview,
  loadHistory,
  summarizeHistory,
  type StorageLike,
} from './observationHistory'
import { listFamilies, searchCatalogRanked } from './catalogSearch'
import { speciesCatalog } from '../data/speciesCatalog'
import { FORBIDDEN_CONSUMPTION_PHRASES } from './riskLabels'
import { enrichCommonNames } from '../data/commonNamesEs'
import { getCuratedMushroomPhoto } from '../data/mushroomPhotos'
import {
  catalogPhotoStats,
  resolveSpeciesImageSync,
} from './speciesImageService'
import { mycologyPlaceholderDataUri } from '../data/mycologyPlaceholder'

function memoryStorage(): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {}
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    },
  }
}

describe('multiViewSlots guided capture', () => {
  it('exposes FungiCLEF-style canonical views', () => {
    expect([...CANONICAL_VIEWS]).toEqual(['gills', 'front', 'habitat', 'detail'])
  })

  it('builds view_types order matching filled slots only', () => {
    const assignments = {
      gills: { fileName: 'a.jpg', previewUrl: 'blob:a' },
      detail: { fileName: 'd.jpg', previewUrl: 'blob:d' },
    }
    expect(buildViewTypesOrder(assignments)).toEqual(['gills', 'detail'])
    expect(orderedSlotKeys(assignments)).toEqual(['gills', 'detail'])
  })

  it('soft default: can submit with ≥1 view when required gaps are warnings (D-B14)', () => {
    const r = assessMultiViewReadiness({
      habitat: { fileName: 'h.jpg', previewUrl: 'blob:h' },
    })
    expect(r.canSubmit).toBe(true)
    expect(r.hardMinViews).toBe(false)
    expect(r.missingRequired).toContain('gills')
    expect(r.missingRequired).toContain('front')
    expect(r.warningCodes).toContain('missing_required')
    expect(r.warningCodes).toContain('missing_detail')
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('soft: empty assignments cannot submit', () => {
    const r = assessMultiViewReadiness({})
    expect(r.canSubmit).toBe(false)
    expect(r.filled).toBe(0)
  })

  it('hard min views: blocks submit until gills+front filled (D-B14 flag)', () => {
    const partial = assessMultiViewReadiness(
      { habitat: { fileName: 'h.jpg', previewUrl: 'blob:h' } },
      { hardMinViews: true },
    )
    expect(partial.canSubmit).toBe(false)
    expect(partial.hardMinViews).toBe(true)
    expect(partial.missingRequired).toEqual(['gills', 'front'])

    const onlyGills = assessMultiViewReadiness(
      { gills: { fileName: 'g.jpg', previewUrl: 'blob:g' } },
      { hardMinViews: true },
    )
    expect(onlyGills.canSubmit).toBe(false)
    expect(onlyGills.missingRequired).toEqual(['front'])

    const both = assessMultiViewReadiness(
      {
        gills: { fileName: 'g.jpg', previewUrl: 'blob:g' },
        front: { fileName: 'f.jpg', previewUrl: 'blob:f' },
      },
      { hardMinViews: true },
    )
    expect(both.canSubmit).toBe(true)
    expect(both.missingRequired).toEqual([])
    expect(both.warningCodes).toContain('missing_habitat')
    expect(both.warningCodes).toContain('missing_detail')
  })

  it('B-27 nextCameraSlot: missing required first, then optional', () => {
    expect(nextCameraSlot({})).toBe('gills')
    expect(
      nextCameraSlot({ gills: { fileName: 'g.jpg', previewUrl: 'blob:g' } }),
    ).toBe('front')
    // habitat filled but required still missing → still gills first
    expect(
      nextCameraSlot({ habitat: { fileName: 'h.jpg', previewUrl: 'blob:h' } }),
    ).toBe('gills')
    // both required filled → first optional
    expect(
      nextCameraSlot({
        gills: { fileName: 'g.jpg', previewUrl: 'blob:g' },
        front: { fileName: 'f.jpg', previewUrl: 'blob:f' },
      }),
    ).toBe('habitat')
    expect(
      nextCameraSlot({
        gills: { fileName: 'g.jpg', previewUrl: 'blob:g' },
        front: { fileName: 'f.jpg', previewUrl: 'blob:f' },
        habitat: { fileName: 'h.jpg', previewUrl: 'blob:h' },
      }),
    ).toBe('detail')
    expect(
      nextCameraSlot({
        gills: { fileName: 'g.jpg', previewUrl: 'blob:g' },
        front: { fileName: 'f.jpg', previewUrl: 'blob:f' },
        habitat: { fileName: 'h.jpg', previewUrl: 'blob:h' },
        detail: { fileName: 'd.jpg', previewUrl: 'blob:d' },
      }),
    ).toBeNull()
  })

  it('B-27 resolveCameraTargetSlot: preferred optional defers to missing required', () => {
    // Preferring habitat while gills empty → still gills
    expect(resolveCameraTargetSlot({}, 'habitat')).toBe('gills')
    // Preferring empty required → honor it
    expect(resolveCameraTargetSlot({}, 'front')).toBe('front')
    // Preferring empty optional after required filled → honor it
    expect(
      resolveCameraTargetSlot(
        {
          gills: { fileName: 'g.jpg', previewUrl: 'blob:g' },
          front: { fileName: 'f.jpg', previewUrl: 'blob:f' },
        },
        'detail',
      ),
    ).toBe('detail')
    // Preferred already filled → fall back to next
    expect(
      resolveCameraTargetSlot(
        { gills: { fileName: 'g.jpg', previewUrl: 'blob:g' } },
        'gills',
      ),
    ).toBe('front')
  })
})

describe('lookalikeRisk ranking', () => {
  it('ranks deadly lookalikes above unknown strings', () => {
    const ranked = rankLookalikes([
      'Unknown fungus',
      'Amanita phalloides',
      'Galerina marginata',
    ])
    expect(ranked[0].risk_label).toBe('deadly')
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score)
    expect(hasHighRiskLookalike(['Amanita phalloides'])).toBe(true)
    const summary = lookalikeSummary(['Amanita phalloides', 'Boletus edulis'])
    expect(summary.total).toBe(2)
    expect(summary.deadly).toBeGreaterThanOrEqual(1)
  })
})

describe('observationHistory store', () => {
  it('append/load/summarize/clear on injectable storage', () => {
    const storage = memoryStorage()
    clearHistoryStore(storage)
    const entry = {
      id: 'req1',
      timestamp: 1000,
      previews: ['blob:x'],
      result: {
        request_id: 'req1',
        decision: 'rejected' as const,
        predictions: [{ species: 'Amanita phalloides', confidence: 0.2 }],
        recommend_human_review: true,
        dangerous_lookalikes: ['Galerina marginata'],
      },
      view_types: ['gills', 'front'],
    }
    appendHistory(entry, storage)
    appendHistory(
      {
        id: 'req2',
        timestamp: 2000,
        previews: [],
        result: {
          request_id: 'req2',
          decision: 'accepted',
          predictions: [{ species: 'Cantharellus cibarius', confidence: 0.5 }],
        },
      },
      storage,
    )
    const all = loadHistory(storage)
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('req2')
    const summary = summarizeHistory(all)
    expect(summary.total).toBe(2)
    expect(summary.rejected).toBe(1)
    expect(summary.need_review).toBe(1)
    expect(entriesNeedingReview(all).length).toBeGreaterThanOrEqual(1)
    clearHistoryStore(storage)
    expect(loadHistory(storage)).toHaveLength(0)
  })
})

describe('catalogSearch ranked', () => {
  it('finds scientific names with higher score than weak matches', () => {
    const hits = searchCatalogRanked(speciesCatalog, { query: 'amanita', limit: 20 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].taxon.toLowerCase()).toContain('amanita')
    expect(hits[0].matchScore).toBeGreaterThan(0)
  })

  it('filters by risk deadly', () => {
    const deadly = searchCatalogRanked(speciesCatalog, {
      query: '',
      risk: 'deadly',
      limit: 50,
    })
    expect(deadly.length).toBeGreaterThan(0)
    expect(deadly.every((s) => s.risk_label === 'deadly')).toBe(true)
  })

  it('filters and ranks by family Amanitaceae', () => {
    const fams = listFamilies(speciesCatalog)
    expect(fams.some((f) => f.family === 'Amanitaceae')).toBe(true)
    const hits = searchCatalogRanked(speciesCatalog, {
      family: 'Amanitaceae',
      limit: 100,
    })
    expect(hits.length).toBeGreaterThan(3)
    expect(hits.every((s) => (s.family || '').toLowerCase() === 'amanitaceae')).toBe(true)
    const qHits = searchCatalogRanked(speciesCatalog, { query: 'amanitaceae', limit: 30 })
    expect(qHits.length).toBeGreaterThan(0)
  })
})

describe('R1 phrases stay forbidden list for CI', () => {
  it('keeps consumption-permission ban list non-empty', () => {
    expect(FORBIDDEN_CONSUMPTION_PHRASES.join(' ')).toMatch(/comestible|safe to eat/i)
  })
})

describe('encyclopedia names and photos', () => {
  it('enriches Spanish common names for known taxa', () => {
    const names = enrichCommonNames('Agaricus xanthodermus', [])
    expect(names.some((n) => /amarilleante/i.test(n))).toBe(true)
  })

  it('verified photo catalog covers most taxa and iconic deadly species', () => {
    const stats = catalogPhotoStats()
    expect(stats.mapped).toBeGreaterThan(250)
    const amanita = getCuratedMushroomPhoto('Amanita phalloides')
    expect(amanita).toBeTruthy()
    expect(amanita!).toMatch(/wikimedia|inaturalist|static\.inaturalist|amazonaws/i)
    const muscaria = resolveSpeciesImageSync('Amanita muscaria')
    expect(muscaria.provider).toBe('catalog')
    expect(muscaria.url.startsWith('http')).toBe(true)
  })

  it('always resolves a displayable image (placeholder never empty)', () => {
    const r = resolveSpeciesImageSync('Totally Unknown Fungus xyz', 'deadly')
    expect(r.url.length).toBeGreaterThan(20)
    expect(r.provider === 'placeholder' || r.provider === 'catalog').toBe(true)
    expect(mycologyPlaceholderDataUri('Test fungus')).toMatch(/^data:image\/svg\+xml/)
  })

  it('catalog species have polished binomials and preferred display names', () => {
    const amanita = speciesCatalog.find((s) => s.taxon === 'Amanita phalloides')
    expect(amanita).toBeTruthy()
    expect(amanita!.common_names.length).toBeGreaterThan(0)
    expect(amanita!.display_name).toBeTruthy()
    const empty = speciesCatalog.filter((s) => s.common_names.length === 0).length
    expect(empty).toBeLessThan(220)
  })
})
