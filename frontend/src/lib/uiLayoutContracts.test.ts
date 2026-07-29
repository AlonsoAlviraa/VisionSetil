/**
 * Layout contracts for marketing + lookalike polish.
 * Structural checks against shipped CSS/source so beta frames don't regress.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { availableClassicPairs, loadClassicPair } from './lookalikeStudio'
import { loadSpeciesCatalog } from '../data/speciesCatalog'

const root = resolve(__dirname, '../..')

function readSrc(rel: string) {
  return readFileSync(resolve(root, 'src', rel), 'utf8')
}

describe('UI layout contracts (marketing + lookalike)', () => {
  it('marketing CSS pins image containers with aspect-ratio + object-fit cover', () => {
    const css = readSrc('styles/marketing.css')
    expect(css).toMatch(/\.mkt-icon-strip__photo\s*\{[^}]*aspect-ratio:\s*1/s)
    expect(css).toMatch(/\.mkt-deadly-card__photo\s*\{[^}]*aspect-ratio:\s*4\/5/s)
    expect(css).toMatch(/\.mkt-icon-strip__photo[\s\S]*object-fit:\s*cover/)
    expect(css).toMatch(/\.mkt-deadly-card__photo[\s\S]*object-fit:\s*cover/)
    expect(css).toMatch(/\.mkt-trust__list\s*\{[^}]*grid-template-columns:\s*repeat\(4/s)
    expect(css).toMatch(/\.mkt-btn\s*\{[^}]*min-height:\s*2\.85rem/s)
  })

  it('lookalike studio card media fills frame without fixed pixel overflow', () => {
    const css = readSrc('styles/atelier.css')
    expect(css).toMatch(/\.lookalike-studio-card__media\s*\{[^}]*aspect-ratio:\s*1/s)
    expect(css).toMatch(/\.lookalike-studio-card__thumb\s*\{[^}]*position:\s*absolute/s)
    expect(css).toMatch(/object-fit:\s*cover/)
    const page = readSrc('pages/LookalikeStudioPage.tsx')
    // Studio compare uses fill thumb (parent aspect box owns size)
    expect(page).toMatch(/lookalike-studio-card__thumb/)
    expect(page).toMatch(/fill\s*\n?\s*className="lookalike-studio-card__thumb"/)
  })

  it('home Campo nocturno CTAs stay wired with consistent chrome', () => {
    const home = readSrc('pages/HomePage.tsx')
    expect(home).toMatch(/data-testid="home-cta-identify"/)
    expect(home).toMatch(/to="\/identificar"/)
    expect(home).toMatch(/to="\/juegos"/)
    expect(home).toMatch(/to="\/enciclopedia"/)
    expect(home).toMatch(/to="\/mapa"/)
    expect(home).toMatch(/cn-home-hero/)
    expect(home).toMatch(/cn-btn--primary/)
    expect(home).toMatch(/data-testid="home-orientation-sticky"/)
  })

  it('classic lookalike pairs load for studio (SSOT-backed)', async () => {
    await loadSpeciesCatalog()
    const pairs = availableClassicPairs()
    expect(pairs.length).toBeGreaterThanOrEqual(4)
    for (const pair of pairs.slice(0, 6)) {
      const { selection } = loadClassicPair(pair)
      expect(selection.length).toBeGreaterThanOrEqual(2)
      expect(selection.every((s) => s.taxon && s.slug)).toBe(true)
    }
  })
})
