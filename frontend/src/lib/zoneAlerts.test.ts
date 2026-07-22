import { describe, expect, it } from 'vitest'
import { alertFromScore, mapPool } from './zoneAlerts'

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
})
