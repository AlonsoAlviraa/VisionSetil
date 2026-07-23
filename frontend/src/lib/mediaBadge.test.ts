import { describe, expect, it } from 'vitest'
import {
  isIllustrationMedia,
  mediaBadgeLabel,
  shouldShowMediaBadge,
} from './mediaBadge'

describe('mediaBadge (Phase D-05)', () => {
  it('treats placeholder/inline as illustration', () => {
    expect(isIllustrationMedia('placeholder')).toBe(true)
    expect(isIllustrationMedia('inline')).toBe(true)
    expect(isIllustrationMedia('primary')).toBe(false)
    expect(isIllustrationMedia('card')).toBe(false)
  })

  it('honors pack/audit media_status over cascade stage', () => {
    expect(isIllustrationMedia('primary', 'ok_procedural')).toBe(true)
    expect(isIllustrationMedia('primary', 'stub')).toBe(true)
    expect(isIllustrationMedia('primary', 'ok_real')).toBe(false)
  })

  it('labels correctly', () => {
    expect(mediaBadgeLabel('placeholder')).toBe('Ilustración')
    expect(mediaBadgeLabel('primary', 'ok_real')).toBe('Foto')
  })

  it('auto mode only shows on illustrations when loaded', () => {
    expect(shouldShowMediaBadge('auto', true, true)).toBe(true)
    expect(shouldShowMediaBadge('auto', false, true)).toBe(false)
    expect(shouldShowMediaBadge('auto', true, false)).toBe(false)
    expect(shouldShowMediaBadge('always', false, true)).toBe(true)
    expect(shouldShowMediaBadge(false, true, true)).toBe(false)
  })
})
