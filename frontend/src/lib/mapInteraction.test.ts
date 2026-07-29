import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMapSearchParams,
  clusterZones,
  filterZonesByQuery,
  findZoneById,
  haversineKm,
  matchRegionFilter,
  nearestZone,
  nextBoardIndex,
  normalizeSearchText,
  parseMapSearchParams,
  replaceMapUrl,
  resolveMapDeepLink,
  stickyRegionAfterSearchChange,
  suggestZonesByQuery,
  topHotspotsByScore,
  CLUSTER_BELOW_ZOOM,
} from './mapInteraction'

const sampleZones = [
  {
    id: 'asturias-oriental',
    name: 'Asturias Oriental & Picos de Europa',
    region: 'Asturias',
    provinces: ['Asturias'],
    habitat: 'Hayedos y robledales atlánticos',
    description: 'Bosques atlánticos frondosos de hayas',
    lat: 43.28,
    lng: -5.13,
  },
  {
    id: 'soria-pinares',
    name: 'Pinares de Soria',
    region: 'Castilla y León',
    provinces: ['Soria'],
    habitat: 'Pinares de pino silvestre',
    description: 'Meseta castellana',
    lat: 41.76,
    lng: -2.47,
  },
  {
    id: 'galicia-courel',
    name: 'O Courel',
    region: 'Galicia',
    provinces: ['Lugo'],
    habitat: 'Hayedo',
    description: 'Montañas gallegas',
    lat: 42.6,
    lng: -7.15,
  },
]

const regions = ['todas', 'Asturias', 'Castilla y León', 'Galicia']

describe('parseMapSearchParams / buildMapSearchParams', () => {
  it('parses zone and region from query string', () => {
    expect(parseMapSearchParams('?zone=asturias-oriental&region=Soria')).toEqual({
      zoneId: 'asturias-oriental',
      region: 'Soria',
      query: null,
    })
    expect(parseMapSearchParams('zone=foo')).toEqual({
      zoneId: 'foo',
      region: null,
      query: null,
    })
  })

  it('parses free-text q search param', () => {
    expect(parseMapSearchParams('?q=hayedo&region=Asturias')).toEqual({
      zoneId: null,
      region: 'Asturias',
      query: 'hayedo',
    })
  })

  it('returns nulls when empty', () => {
    expect(parseMapSearchParams('')).toEqual({
      zoneId: null,
      region: null,
      query: null,
    })
    expect(parseMapSearchParams('?')).toEqual({
      zoneId: null,
      region: null,
      query: null,
    })
  })

  it('builds query without empty keys', () => {
    expect(buildMapSearchParams({ zoneId: 'a', region: 'todas' })).toBe('zone=a')
    expect(buildMapSearchParams({ zoneId: null, region: 'Asturias' })).toBe(
      'region=Asturias',
    )
    expect(buildMapSearchParams({ query: 'Soria' })).toBe('q=Soria')
    expect(buildMapSearchParams({})).toBe('')
  })
})

describe('replaceMapUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips replaceState when URL is unchanged', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: { pathname: '/mapa', search: '?zone=asturias-oriental' },
      history: { replaceState },
    })
    replaceMapUrl({ zoneId: 'asturias-oriental', region: null, pathname: '/mapa' })
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('writes zone query and omits empty region', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: { pathname: '/mapa', search: '' },
      history: { replaceState },
    })
    replaceMapUrl({ zoneId: 'asturias-oriental', region: null, pathname: '/mapa' })
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/mapa?zone=asturias-oriental',
    )
  })
})

describe('resolveMapDeepLink', () => {
  it('selects zone and CCAA from URL without intermediate empty state', () => {
    const r = resolveMapDeepLink(
      '?zone=asturias-oriental&region=Asturias',
      sampleZones,
      regions,
    )
    expect(r.zoneId).toBe('asturias-oriental')
    expect(r.zoneMissing).toBeNull()
    expect(r.filterRegion).toBe('Asturias')
    expect(r.searchQuery).toBe('')
    expect(r.stickyRegion).toBe('Asturias')
  })

  it('maps province region=Soria to search + sticky', () => {
    const r = resolveMapDeepLink('?region=Soria', sampleZones, regions)
    expect(r.filterRegion).toBe('todas')
    expect(r.searchQuery).toBe('Soria')
    expect(r.stickyRegion).toBe('Soria')
  })

  it('uses explicit q for search while keeping region filter', () => {
    const r = resolveMapDeepLink(
      '?q=hayedo&region=Asturias',
      sampleZones,
      regions,
    )
    expect(r.filterRegion).toBe('Asturias')
    expect(r.searchQuery).toBe('hayedo')
  })

  it('flags missing zone id', () => {
    const r = resolveMapDeepLink('?zone=not-a-real-id', sampleZones, regions)
    expect(r.zoneId).toBeNull()
    expect(r.zoneMissing).toBe('not-a-real-id')
  })
})

describe('stickyRegionAfterSearchChange', () => {
  it('clears sticky when search emptied (near-me / clear)', () => {
    expect(stickyRegionAfterSearchChange('Soria', '')).toBeNull()
    expect(stickyRegionAfterSearchChange('Soria', '  ')).toBeNull()
  })

  it('keeps sticky while search still matches province', () => {
    expect(stickyRegionAfterSearchChange('Soria', 'Soria')).toBe('Soria')
    expect(stickyRegionAfterSearchChange('Soria', 'soria pin')).toBe('Soria')
  })

  it('clears sticky when search diverges', () => {
    expect(stickyRegionAfterSearchChange('Soria', 'Picos')).toBeNull()
  })
})

describe('filterZonesByQuery', () => {
  it('matches name tokens (Picos, hayedo)', () => {
    const r = filterZonesByQuery(sampleZones, 'Picos')
    expect(r.map((z) => z.id)).toEqual(['asturias-oriental'])
    const h = filterZonesByQuery(sampleZones, 'hayedo')
    expect(h.some((z) => z.id === 'galicia-courel')).toBe(true)
  })

  it('matches province Soria', () => {
    const r = filterZonesByQuery(sampleZones, 'Soria')
    expect(r.map((z) => z.id)).toEqual(['soria-pinares'])
  })

  it('is diacritic-insensitive and empty query returns all', () => {
    expect(normalizeSearchText('Ávila')).toBe('avila')
    expect(filterZonesByQuery(sampleZones, '')).toHaveLength(3)
    expect(filterZonesByQuery(sampleZones, '  ')).toHaveLength(3)
  })

  it('requires all tokens (AND)', () => {
    expect(filterZonesByQuery(sampleZones, 'Picos Galicia')).toHaveLength(0)
    expect(filterZonesByQuery(sampleZones, 'Asturias hayedos')).toHaveLength(1)
  })
})

describe('findZoneById / matchRegionFilter', () => {
  it('finds zone by id case-insensitively', () => {
    expect(findZoneById(sampleZones, 'Asturias-Oriental')?.id).toBe(
      'asturias-oriental',
    )
    expect(findZoneById(sampleZones, null)).toBeNull()
  })

  it('matches region labels loosely', () => {
    expect(matchRegionFilter(regions, 'asturias')).toBe('Asturias')
    expect(matchRegionFilter(regions, 'Castilla')).toBe('Castilla y León')
    expect(matchRegionFilter(regions, 'todas')).toBeNull()
    expect(matchRegionFilter(regions, 'Nowhere')).toBeNull()
  })

  it('resolves co-official region aliases to inventory labels', () => {
    const extended = [
      ...regions,
      'Comunidad Valenciana',
      'Islas Baleares',
      'Cataluña',
      'País Vasco',
    ]
    expect(matchRegionFilter(extended, 'Comunitat Valenciana')).toBe(
      'Comunidad Valenciana',
    )
    expect(matchRegionFilter(extended, 'Illes Balears')).toBe('Islas Baleares')
    expect(matchRegionFilter(extended, 'Catalunya')).toBe('Cataluña')
    expect(matchRegionFilter(extended, 'Euskadi')).toBe('País Vasco')
  })
})

describe('suggestZonesByQuery', () => {
  it('returns ranked name hits and ignores short queries', () => {
    expect(suggestZonesByQuery(sampleZones, 'a')).toEqual([])
    const hits = suggestZonesByQuery(sampleZones, 'soria')
    expect(hits.map((z) => z.id)).toEqual(['soria-pinares'])
  })
})

describe('topHotspotsByScore', () => {
  it('sorts by score desc and limits to 5', () => {
    const scores: Record<string, number | null> = {
      a: 90,
      b: 40,
      c: 95,
      d: null,
      e: 70,
      f: 80,
      g: 60,
    }
    const top = topHotspotsByScore(['a', 'b', 'c', 'd', 'e', 'f', 'g'], scores, 5)
    expect(top.map((t) => t.id)).toEqual(['c', 'a', 'f', 'e', 'g'])
    expect(top[0].score).toBe(95)
  })

  it('excludes null/NaN scores', () => {
    expect(topHotspotsByScore(['x'], { x: null })).toEqual([])
    expect(topHotspotsByScore(['x'], { x: Number.NaN })).toEqual([])
  })
})

describe('nearestZone / haversineKm', () => {
  it('computes distance roughly Madrid–Barcelona ~500km', () => {
    const d = haversineKm(40.4, -3.7, 41.4, 2.17)
    expect(d).toBeGreaterThan(450)
    expect(d).toBeLessThan(650)
  })

  it('picks nearest zone to a point near Soria', () => {
    const near = nearestZone(sampleZones, 41.8, -2.5)
    expect(near?.id).toBe('soria-pinares')
  })

  it('returns null for empty list or invalid coords', () => {
    expect(nearestZone([], 40, -3)).toBeNull()
    expect(nearestZone(sampleZones, Number.NaN, 0)).toBeNull()
  })
})

describe('clusterZones', () => {
  it('returns points when zoomed in', () => {
    const c = clusterZones(sampleZones, CLUSTER_BELOW_ZOOM)
    expect(c.every((x) => x.type === 'point')).toBe(true)
    expect(c).toHaveLength(3)
  })

  it('groups nearby zones when zoomed out (hard assert count>=2)', () => {
    // Same cell at zoom 5 (cell ~2°) — force adjacent points
    const close = [
      { id: 'a', lat: 41.0, lng: -3.0 },
      { id: 'b', lat: 41.05, lng: -3.02 },
      { id: 'c', lat: 43.5, lng: -8.0 },
    ]
    const c = clusterZones(close, 5)
    const clusters = c.filter((x) => x.type === 'cluster')
    const totalIds = c.reduce(
      (n, x) => n + (x.type === 'cluster' ? x.count : 1),
      0,
    )
    expect(totalIds).toBe(3)
    // a+b must cluster at zoom 5
    expect(clusters.length).toBeGreaterThanOrEqual(1)
    expect(clusters.some((cl) => cl.count >= 2)).toBe(true)
  })
})

describe('nextBoardIndex (single-step keyboard policy)', () => {
  it('wraps around the board one step at a time', () => {
    expect(nextBoardIndex(0, -1, 5)).toBe(4)
    expect(nextBoardIndex(4, 1, 5)).toBe(0)
    expect(nextBoardIndex(-1, 1, 5)).toBe(0)
    expect(nextBoardIndex(0, 1, 0)).toBe(-1)
    // two sequential steps (simulating one handler, not double)
    let i = 0
    i = nextBoardIndex(i, 1, 5)
    expect(i).toBe(1)
    i = nextBoardIndex(i, 1, 5)
    expect(i).toBe(2)
  })
})
