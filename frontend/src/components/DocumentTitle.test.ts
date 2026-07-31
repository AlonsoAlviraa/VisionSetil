/**
 * N4 / v1.42 — DocumentTitle route table covers App product paths.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_ROUTE_PREFIXES } from './DocumentTitle'

describe('DocumentTitle route coverage', () => {
  it('APP_ROUTE_PREFIXES are referenced in App.tsx Routes', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8')
    for (const path of APP_ROUTE_PREFIXES) {
      if (path === '/') {
        expect(app).toMatch(/path=["']\/["']/)
        continue
      }
      expect(app.includes(`path="${path}"`) || app.includes(`path={'${path}'}`), path).toBe(
        true,
      )
    }
  })

  it('DocumentTitle ROUTE_KEYS cover every APP_ROUTE_PREFIXES entry', () => {
    const src = readFileSync(join(__dirname, 'DocumentTitle.tsx'), 'utf8')
    for (const path of APP_ROUTE_PREFIXES) {
      // each prefix should appear as a ROUTE_KEYS path string
      expect(src.includes(`'${path}'`) || src.includes(`"${path}"`), path).toBe(true)
    }
  })

  it('falls back to not-found key for unknown routes (source contract)', () => {
    const src = readFileSync(join(__dirname, 'DocumentTitle.tsx'), 'utf8')
    expect(src).toMatch(/nav\.notFound/)
  })
})
