/**
 * ImageCompare contracts (UX-02).
 * SSOT testid: identify-result-image-compare — never invent result-image-compare.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickComparePair } from './ImageCompare'

const root = resolve(__dirname, '../..')

function readSrc(rel: string) {
  return readFileSync(resolve(root, 'src', rel), 'utf8')
}

describe('ImageCompare', () => {
  it('exports pickComparePair: gills vs front when labeled', () => {
    const pair = pickComparePair(
      ['habitat', 'gills', 'front'],
      ['h.jpg', 'g.jpg', 'f.jpg'],
    )
    expect(pair).not.toBeNull()
    expect(pair!.left.src).toBe('g.jpg')
    expect(pair!.right.src).toBe('f.jpg')
  })

  it('returns null with fewer than 2 previews', () => {
    expect(pickComparePair(['gills'], ['a.jpg'])).toBeNull()
    expect(pickComparePair([], [])).toBeNull()
  })

  it('falls back to first two when no gills/front labels', () => {
    const pair = pickComparePair(['free_1', 'free_2'], ['a.jpg', 'b.jpg'])
    expect(pair!.left.src).toBe('a.jpg')
    expect(pair!.right.src).toBe('b.jpg')
  })

  it('component ships identify-result-image-compare (never result-image-compare alias)', () => {
    const src = readSrc('components/ImageCompare.tsx')
    expect(src).toMatch(/data-testid=\{testId\}|identify-result-image-compare/)
    expect(src).toMatch(/testId = 'identify-result-image-compare'/)
    // Forbid bare alias; allow identify-result-image-compare SSOT id
    expect(src.replaceAll('identify-result-image-compare', '')).not.toMatch(
      /result-image-compare/,
    )
    expect(src).toMatch(/image-compare-mode-side/)
    expect(src).toMatch(/image-compare-mode-wipe/)
    expect(src).toMatch(/aria-pressed/)
    expect(src.toLowerCase()).toMatch(/orientaci|nunca consumo|never consum/)
  })

  it('Identify result region wires ImageCompare with shipped testid', () => {
    const page = readSrc('pages/IdentifyPage.tsx')
    expect(page).toMatch(/ImageCompare|pickComparePair/)
    expect(page).toMatch(/identify-result-image-compare/)
    expect(page.replaceAll('identify-result-image-compare', '')).not.toMatch(
      /result-image-compare/,
    )
  })
})
