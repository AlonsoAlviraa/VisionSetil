/**
 * B-35 Identify chrome audit + safety-by-surface lock-in.
 * Identify surfaces: no FoodQualityChip / getFoodQuality / food-q chrome.
 * Encyclopedia surfaces: food-quality may remain (untouched by this ban).
 * Policy: docs/SAFETY_POLICY.md § Safety-by-surface (D16 / D-B16).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src')
const repoDocs = join(process.cwd(), '..', 'docs')

function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

function readDocs(rel: string) {
  return readFileSync(join(repoDocs, rel), 'utf8')
}

/** Identify product result chrome — must stay free of food-quality UI. */
const IDENTIFY_SURFACE_SOURCES = [
  'components/ResultCard.tsx',
  'components/ResultModeBanner.tsx',
  'components/ModelInsightsPanel.tsx',
  'pages/IdentifyPage.tsx',
  'pages/HistoryPage.tsx',
] as const

/** Encyclopedia / educational food chrome — must remain available. */
const ENCYCLOPEDIA_FOOD_SOURCES = [
  'components/FoodQualityChip.tsx',
  'components/SpeciesPhotoCard.tsx',
  'pages/EncyclopediaPage.tsx',
  'pages/SpeciesDetailPage.tsx',
  'lib/foodQuality.ts',
] as const

/** Active food chrome (imports / JSX / calls) — ban comments are allowed. */
const FOOD_CHROME_IMPORT =
  /from\s+['"][^'"]*FoodQualityChip['"]|from\s+['"][^'"]*foodQuality['"]|getFoodQuality\s*\(|<\s*FoodQualityChip\b/

/** Food-safe green hexes that must not appear in Identify result-card CSS. */
const FOOD_SAFE_GREEN_HEX = /#(?:16a34a|22c55e|4ade80|10b981|9be15d|4f9a6e)\b/i

describe('Identify chrome safety (B-35 / D-B16)', () => {
  it('ResultCard does not import or render FoodQualityChip / getFoodQuality', () => {
    const src = readSrc('components/ResultCard.tsx')
    expect(src).not.toMatch(FOOD_CHROME_IMPORT)
    expect(src).toMatch(/RiskChip/)
    expect(src).toMatch(/D-B16|FoodQualityChip banned/)
    expect(src).toMatch(/SAFETY_POLICY/)
  })

  it('Identify surface sources ban food-quality chrome', () => {
    const hits: string[] = []
    for (const rel of IDENTIFY_SURFACE_SOURCES) {
      const text = readSrc(rel)
      if (FOOD_CHROME_IMPORT.test(text)) {
        hits.push(rel)
      }
    }
    expect(hits).toEqual([])
  })

  it('encyclopedia food-quality surfaces remain (untouched)', () => {
    for (const rel of ENCYCLOPEDIA_FOOD_SOURCES) {
      const text = readSrc(rel)
      expect(text, rel).toMatch(/FoodQuality|getFoodQuality|food_class|food-q-chip|food-badge/)
    }
  })

  it('result-card CSS has no food-safe green chrome (Identify)', () => {
    const redesign = readSrc('styles/redesign.css')
    // Isolate .result-card block through next top-level section
    const start = redesign.indexOf('/* Result card')
    expect(start).toBeGreaterThanOrEqual(0)
    const slice = redesign.slice(start, start + 4500)
    expect(slice).toMatch(/result-card/)
    expect(slice).not.toMatch(FOOD_SAFE_GREEN_HEX)
    // Accepted / top-match / high-confidence must use info tones, not --safe
    expect(slice).toMatch(/decision-banner\.accepted/)
    expect(slice).toMatch(/--info/)
    expect(slice).not.toMatch(/var\(--safe/)
  })

  it('dead Identify food-row chrome is not referenced in ResultCard', () => {
    const card = readSrc('components/ResultCard.tsx')
    expect(card).not.toMatch(/result-food-row/)
  })
})

describe('SAFETY_POLICY safety-by-surface cross-link', () => {
  it('documents Identify vs Encyclopedia matrix and points at ResultCard', () => {
    const policy = readDocs('SAFETY_POLICY.md')
    expect(policy).toMatch(/Safety-by-surface/)
    expect(policy).toMatch(/D-B16|D16/)
    expect(policy).toMatch(/FoodQualityChip/)
    expect(policy).toMatch(/Identify/)
    expect(policy).toMatch(/Encyclopedia/)
    expect(policy).toMatch(/ResultCard/)
    expect(policy).toMatch(/identifyChromeSafety\.test/)
    expect(policy).toMatch(/PHASE_B_HONEST_IDENTIFY|MEGA_PLAN_PROFESSIONAL_UPGRADE/)
  })
})
