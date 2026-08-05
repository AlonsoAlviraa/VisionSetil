/**
 * ImageCompare contracts (UX-02).
 * SSOT testid: identify-result-image-compare — never invent result-image-compare.
 * Wipe mode: full-frame clip reveal (clip-path), not width-scale of the image.
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

  it('wipe mode uses full-frame clip (--wipe-pct / clip-path), not width-scale img', () => {
    const src = readSrc('components/ImageCompare.tsx')
    const css = readSrc('styles/redesign.css')
    // Inline style must set --wipe-pct for CSS clip
    expect(src).toMatch(/--wipe-pct/)
    // Must NOT set width: `${wipe}%` on the wipe-top clip layer (old squash bug)
    expect(src).not.toMatch(/wipe-top[^\n]*width:\s*`\$\{wipe\}%`/)
    expect(src).not.toMatch(/style=\{\{\s*width:\s*`\$\{wipe\}%`/)
    // CSS: clip-path reveal + full-frame imgs
    expect(css).toMatch(/clip-path:\s*inset\(0 calc\(100% - var\(--wipe-pct\)\)/)
    expect(css).toMatch(/\.image-compare__wipe-top\s*\{[^}]*clip-path/s)
    expect(css).toMatch(/\.image-compare__wipe-base img[\s\S]*?width:\s*100%/)
    expect(css).toMatch(/max-width:\s*none/)
  })

  it('ResultCard wires ImageCompare with shipped testid (hierarchy 5b, before education)', () => {
    const card = readSrc('components/ResultCard.tsx')
    expect(card).toMatch(/ImageCompare|pickComparePair/)
    expect(card).toMatch(/identify-result-image-compare/)
    expect(card.replaceAll('identify-result-image-compare', '')).not.toMatch(
      /result-image-compare/,
    )
    // Compare before education handoff
    const compareIdx = card.indexOf('identify-result-image-compare')
    const eduIdx = card.indexOf('data-testid="cta-expert-handoff"')
    expect(compareIdx).toBeGreaterThan(0)
    expect(eduIdx).toBeGreaterThan(compareIdx)
  })
})
