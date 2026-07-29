import { describe, expect, it } from 'vitest'
import {
  classifyS9TrafficDepth,
  normalizeS9LiveReject,
  s9TrafficNote,
} from './s9LiveRejectHonesty'

describe('s9LiveRejectHonesty (v1.9.8)', () => {
  it('classifies traffic depth bands', () => {
    expect(classifyS9TrafficDepth(0)).toBe('empty')
    expect(classifyS9TrafficDepth(3)).toBe('sparse')
    expect(classifyS9TrafficDepth(10)).toBe('thin')
    expect(classifyS9TrafficDepth(30, 6)).toBe('moderate')
    expect(classifyS9TrafficDepth(30, 0)).toBe('thin')
    expect(classifyS9TrafficDepth(120, 25)).toBe('rich')
  })

  it('normalizes monitor fail-closed unlock + honesty notes', () => {
    const n = normalizeS9LiveReject({
      status: 'ok',
      n_entries: 35,
      reject_rate: 0.4,
      traffic_depth: 'moderate',
      top_reason: 'high_entropy',
      modes: { real: 30, mock: 5 },
      n_real_mode: 30,
      n_mock_mode: 5,
      multiview: {
        n_with_view_labels: 20,
        n_multiview_ge2: 15,
        n_diag_full_gills_front_detail: 8,
      },
      health_flags: ['traffic_depth_moderate'],
      product_unlock: true,
    })
    expect(n.productUnlock).toBe(false)
    expect(n.trafficDepth).toBe('moderate')
    expect(n.nReal).toBe(30)
    expect(n.multiviewGe2).toBe(15)
    expect(n.noteEs.toLowerCase()).toMatch(/nunca|orientaci|unlock/)
    expect(n.noteEn.toLowerCase()).toMatch(/never|unlock|orientation|consumption/)
  })

  it('empty traffic notes never imply edible clearance', () => {
    const note = s9TrafficNote('empty', 'en')
    expect(note.en.toLowerCase()).toMatch(/never|skip/)
    expect(note.en.toLowerCase()).not.toMatch(/safe to eat|forage permission/)
  })
})
