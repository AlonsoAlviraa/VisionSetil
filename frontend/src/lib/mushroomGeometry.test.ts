import { describe, expect, it } from 'vitest'
import { buildMushroomRing, buildSporeCloud, seedUnit } from './mushroomGeometry'
import { FORBIDDEN_CONSUMPTION_PHRASES, toRiskLabel } from './riskLabels'
import { speciesCatalog, speciesCatalogMeta } from '../data/speciesCatalog'

describe('mushroomGeometry pure builders', () => {
  it('seedUnit is deterministic and in [0,1)', () => {
    expect(seedUnit(1)).toBe(seedUnit(1))
    const v = seedUnit(99)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  it('buildMushroomRing returns requested count with finite morphs', () => {
    const ring = buildMushroomRing(8, 2, 3)
    expect(ring).toHaveLength(8)
    for (const m of ring) {
      expect(Number.isFinite(m.x)).toBe(true)
      expect(Number.isFinite(m.stemHeight)).toBe(true)
      expect(m.capRadius).toBeGreaterThan(0)
    }
  })

  it('buildSporeCloud returns rising particles', () => {
    const cloud = buildSporeCloud(20, 1)
    expect(cloud).toHaveLength(20)
    expect(cloud.every((p) => p.speed > 0)).toBe(true)
  })
})

describe('riskLabels R1', () => {
  it('collapses edible/safe strings to non-consumption risk', () => {
    expect(toRiskLabel('edible')).toBe('unknown_or_risky')
    expect(toRiskLabel('safe')).toBe('unknown_or_risky')
    expect(toRiskLabel('deadly')).toBe('deadly')
  })

  it('forbidden phrases list is non-empty for CI grep', () => {
    expect(FORBIDDEN_CONSUMPTION_PHRASES.length).toBeGreaterThan(0)
  })
})

describe('expanded species catalog artifact', () => {
  it('has substantially more taxa than mock baseline of 6', () => {
    expect(speciesCatalogMeta.count).toBeGreaterThan(50)
    expect(speciesCatalog.length).toBe(speciesCatalogMeta.count)
    expect(speciesCatalog.every((s) => s.taxon && s.risk_label && s.slug)).toBe(true)
  })
})
