/**
 * Architecture M8+ — guardrails for CTA dialect chaos on product pages & components.
 * Prefer Button / LinkButton / ExternalLinkButton; ban raw multi-dialect class soup.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const srcDir = join(__dirname, '..')
const pagesDir = join(srcDir, 'pages')
const componentsDir = join(srcDir, 'components')

function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listTsx(p))
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/**
 * Allowlist for intentional raw `className=...btn-atelier` in product TSX.
 * v1.24: empty — all product pages + shared components use primitives.
 * (Button/LinkButton/ExternalLinkButton emit classes internally.)
 */
const ALLOW_RAW_BTN_ATELIER = new Set<string>([
  // empty on purpose
])

/** Forbidden: competing primary class systems on the same element. */
const FORBIDDEN = [
  /className=\{?["'`][^"'`]*mkt-btn--primary[^"'`]*btn-atelier/,
  /className=\{?["'`][^"'`]*btn-atelier--primary[^"'`]*mkt-btn/,
  /className=\{?["'`][^"'`]*cn-btn--primary[^"'`]*btn-atelier/,
]

describe('architecture CTA contracts (M8)', () => {
  const pageFiles = listTsx(pagesDir)
  const componentFiles = listTsx(componentsDir)
  const productFiles = [...pageFiles, ...componentFiles]

  it('pages/components do not mix two primary CTA class systems on one element', () => {
    const bad: string[] = []
    for (const file of productFiles) {
      const text = readFileSync(file, 'utf8')
      for (const re of FORBIDDEN) {
        if (re.test(text)) bad.push(`${file} ~ ${re}`)
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('core product pages prefer LinkButton or Button primitives', () => {
    const mustUsePrimitives = [
      'MoreHubPage.tsx',
      'NotFoundPage.tsx',
      'IdentifyPage.tsx',
      'HomePage.tsx',
      'EncyclopediaPage.tsx',
      'SpeciesDetailPage.tsx',
      'CommunityPage.tsx',
      'HistoryPage.tsx',
      'OfflinePackPage.tsx',
      'ExpertReviewPage.tsx',
      'SetadlePage.tsx',
      'MushroomWordlePage.tsx',
      'LookalikeStudioPage.tsx',
      'BetaFeedbackPage.tsx',
      'SpainMapPage.tsx',
      'MlDashboardPage.tsx',
    ]
    for (const name of mustUsePrimitives) {
      const file = pageFiles.find((f) => f.endsWith(name))
      expect(file, name).toBeTruthy()
      const text = readFileSync(file!, 'utf8')
      const ok =
        text.includes('LinkButton') ||
        text.includes('ExternalLinkButton') ||
        text.includes("from '../components/ui'") ||
        text.includes('from "../components/ui"') ||
        text.includes("from '../components/ui/Button'") ||
        text.includes("from './ui'")
      expect(ok, `${name} should import Button/LinkButton primitives`).toBe(true)
    }
  })

  it('no raw className btn-atelier in product pages/components (allowlist empty)', () => {
    const residual: string[] = []
    for (const file of productFiles) {
      const base = file.replace(/\\/g, '/').split('/').pop()!
      // Primitives themselves emit the classes — exclude ui shell
      if (file.replace(/\\/g, '/').includes('/components/ui/')) continue
      const text = readFileSync(file, 'utf8')
      if (/className=.*btn-atelier/.test(text) && !ALLOW_RAW_BTN_ATELIER.has(base)) {
        residual.push(base)
      }
    }
    expect(
      residual,
      `Raw btn-atelier residual (migrate or allowlist): ${residual.join(', ')}`,
    ).toEqual([])
  })

  it('core product pages import PageShell (v1.38+)', () => {
    const mustUsePageShell = [
      'IdentifyPage.tsx',
      'HistoryPage.tsx',
      'EducationPage.tsx',
      'OfflinePackPage.tsx',
      'ExpertReviewPage.tsx',
      'BetaFeedbackPage.tsx',
      'GamesHubPage.tsx',
      'CommunityPage.tsx',
      'LookalikeStudioPage.tsx',
      'EncyclopediaPage.tsx',
      'QuizGamePage.tsx',
      'SetadlePage.tsx',
      'MushroomWordlePage.tsx',
      'MoreHubPage.tsx',
      'NotFoundPage.tsx',
      'HomePage.tsx',
      'SpeciesDetailPage.tsx',
      'SpainMapPage.tsx',
      'LoginPage.tsx',
      'RegisterPage.tsx',
      'MlDashboardPage.tsx',
    ]
    for (const name of mustUsePageShell) {
      const file = pageFiles.find((f) => f.endsWith(name))
      expect(file, name).toBeTruthy()
      const text = readFileSync(file!, 'utf8')
      expect(text.includes('PageShell'), `${name} should use PageShell`).toBe(true)
    }
  })
})
