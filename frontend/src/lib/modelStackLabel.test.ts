import { describe, expect, it } from 'vitest'
import { stackBadgeEs, stackModeFromModelStack } from './modelStackLabel'
import type { ModelStack } from '../api/types'

const mockStack: ModelStack = {
  detector: 'mock-yolo',
  visual_embedder: 'mock-dino',
  image_text_embedder: 'mock-clip',
  metadata_encoder: 'mock-meta',
}

const realStack: ModelStack = {
  detector: 'yoloe-v1',
  visual_embedder: 'dinov2-vitb14',
  image_text_embedder: 'siglip-base',
  metadata_encoder: 'tabular-mlp',
}

describe('modelStackLabel (Wave D)', () => {
  it('detects full mock as demo', () => {
    expect(stackModeFromModelStack(mockStack)).toBe('demo')
    expect(stackBadgeEs(mockStack).label).toMatch(/demo|mock/i)
  })

  it('detects real backends as loaded', () => {
    expect(stackModeFromModelStack(realStack)).toBe('loaded')
    expect(stackBadgeEs(realStack).label).toMatch(/cargado/i)
  })

  it('detects mixed stacks', () => {
    expect(
      stackModeFromModelStack({
        ...realStack,
        detector: 'mock-detector',
      }),
    ).toBe('mixed')
  })

  it('handles null stack', () => {
    expect(stackModeFromModelStack(null)).toBe('unknown')
  })
})
