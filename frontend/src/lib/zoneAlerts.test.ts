import { describe, expect, it } from 'vitest'
import {
  alertFromScore,
  hotspotRadiusMeters,
  isHotspotActive,
  mapPool,
  mapPoolChunked,
} from './zoneAlerts'

describe('zoneAlerts weather board', () => {
  it('maps low scores to red extreme / desfavorable', () => {
    const a = alertFromScore(20)
    expect(a.level).toBe('extreme')
    expect(a.color).toMatch(/#b91c1c|rgb/i)
    expect(a.label.toLowerCase()).toMatch(/desfavorable/)
  })

  it('maps high scores to good / favorable', () => {
    const a = alertFromScore(88)
    expect(a.level).toBe('good')
    expect(a.label.toLowerCase()).toMatch(/favorable/)
  })

  it('unknown when score null', () => {
    expect(alertFromScore(null).level).toBe('unknown')
  })

  it('mapPool respects concurrency and order', async () => {
    const items = [1, 2, 3, 4, 5]
    const out = await mapPool(items, 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40, 50])
  })

  it('hotspot radius grows with score and abundance', () => {
    const low = hotspotRadiusMeters('baja', 20)
    const high = hotspotRadiusMeters('alta', 90)
    expect(high).toBeGreaterThan(low)
    expect(hotspotRadiusMeters('media', null)).toBeGreaterThan(0)
    expect(isHotspotActive('good')).toBe(true)
    expect(isHotspotActive('extreme')).toBe(false)
  })

  it('mapPoolChunked preserves order and reports chunks', async () => {
    const items = [1, 2, 3, 4, 5]
    const seen: number[] = []
    const out = await mapPoolChunked(
      items,
      {
        concurrency: 2,
        chunkSize: 2,
        onChunk: (partial) => {
          for (const p of partial) seen.push(p.index)
        },
      },
      async (n) => n * 3,
    )
    expect(out).toEqual([3, 6, 9, 12, 15])
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })
})
