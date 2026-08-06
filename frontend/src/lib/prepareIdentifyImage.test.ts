/**
 * Identify JPEG edge-cap contracts (launch readiness / dual-shell parity).
 */
import { describe, expect, it } from 'vitest'
import {
  IDENTIFY_JPEG_MAX_EDGE,
  IDENTIFY_JPEG_QUALITY,
  IDENTIFY_PHOTO_PERF_BUDGETS,
  identifyJpegScale,
} from './prepareIdentifyImage'

describe('prepareIdentifyImage budgets', () => {
  it('locks JPEG long-edge ≤1280 and quality ~0.82', () => {
    expect(IDENTIFY_JPEG_MAX_EDGE).toBe(1280)
    expect(IDENTIFY_JPEG_QUALITY).toBe(0.82)
    expect(IDENTIFY_PHOTO_PERF_BUDGETS.jpegMaxEdge).toBe(1280)
    expect(IDENTIFY_PHOTO_PERF_BUDGETS.previewLoading).toBe('eager')
  })

  it('identifyJpegScale downscales only when over budget', () => {
    expect(identifyJpegScale(800, 600)).toBe(1)
    expect(identifyJpegScale(1280, 720)).toBe(1)
    expect(identifyJpegScale(2560, 1440)).toBeCloseTo(0.5, 5)
    expect(identifyJpegScale(3840, 2160)).toBeCloseTo(1280 / 3840, 5)
  })

  it('does not invent product_unlock or forage permission in module surface', async () => {
    const mod = await import('./prepareIdentifyImage')
    const src = Object.keys(mod).join(' ')
    expect(src.toLowerCase()).not.toMatch(/product_unlock|forage/)
  })
})
