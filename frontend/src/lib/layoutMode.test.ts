import { describe, expect, it } from 'vitest'
import {
  autoLayoutMode,
  isLayoutMode,
  layoutModeLabelEs,
  resolveLayoutMode,
} from './layoutMode'

describe('layoutMode', () => {
  it('validates modes', () => {
    expect(isLayoutMode('app')).toBe(true)
    expect(isLayoutMode('web')).toBe(true)
    expect(isLayoutMode('tablet')).toBe(false)
  })

  it('auto: narrow → app, wide → web', () => {
    expect(autoLayoutMode(390)).toBe('app')
    expect(autoLayoutMode(1200)).toBe('web')
  })

  it('labels in Spanish', () => {
    expect(layoutModeLabelEs('app')).toMatch(/app/i)
    expect(layoutModeLabelEs('web')).toMatch(/web/i)
  })

  it('URL forces mode over auto', () => {
    const r = resolveLayoutMode({ search: '?layout=web', viewportWidth: 390, preferStored: false })
    expect(r.mode).toBe('web')
    expect(r.source).toBe('url')
  })
})
