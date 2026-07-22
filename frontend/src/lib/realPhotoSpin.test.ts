import { describe, expect, it } from 'vitest'
import { frameIndexFromDrag, nextFrameIndex } from './realPhotoSpin'

describe('real photo spin math', () => {
  it('maps drag to wrapped frame index', () => {
    expect(frameIndexFromDrag(0, 0, 12)).toBe(0)
    expect(frameIndexFromDrag(0, 56, 12, 28)).toBe(2)
    expect(frameIndexFromDrag(0, -28, 12, 28)).toBe(11) // wrap left
    expect(frameIndexFromDrag(5, 0, 1)).toBe(0)
  })

  it('advances autoplay frames with wrap', () => {
    expect(nextFrameIndex(0, 5)).toBe(1)
    expect(nextFrameIndex(4, 5)).toBe(0)
    expect(nextFrameIndex(2, 5, -1)).toBe(1)
    expect(nextFrameIndex(0, 1)).toBe(0)
  })
})
