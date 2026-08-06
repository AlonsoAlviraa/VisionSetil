/**
 * ScrollToTop hash contract — deep-links must not force window to top.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shouldSkipScrollToTop } from './ScrollToTop'

describe('ScrollToTop hash deep-link contract', () => {
  it('skips force-top when a non-empty hash target is present', () => {
    expect(shouldSkipScrollToTop('#multi-view')).toBe(true)
    expect(shouldSkipScrollToTop('#deadly-study')).toBe(true)
    expect(shouldSkipScrollToTop('multi-view')).toBe(true)
  })

  it('does not skip when hash is empty or bare #', () => {
    expect(shouldSkipScrollToTop('')).toBe(false)
    expect(shouldSkipScrollToTop('#')).toBe(false)
    expect(shouldSkipScrollToTop(null)).toBe(false)
    expect(shouldSkipScrollToTop(undefined)).toBe(false)
  })

  it('ScrollToTop source early-returns on hash (no race with Education anchors)', () => {
    const src = readFileSync(resolve(__dirname, 'ScrollToTop.tsx'), 'utf8')
    expect(src).toMatch(/shouldSkipScrollToTop/)
    expect(src).toMatch(/hash/)
    expect(src).toMatch(/if\s*\(\s*shouldSkipScrollToTop\(hash\)\s*\)\s*return/)
  })
})
