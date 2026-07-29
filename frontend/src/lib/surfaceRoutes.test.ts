/**
 * One-by-one product surface wiring check (S8 review).
 * Asserts App routes + Header nav cover primary surfaces.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src')

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

/** Primary product surfaces wired in App.tsx (U7 — keep in sync with Routes). */
const SURFACES: Array<{ name: string; path: string; pageHint: string }> = [
  { name: 'Home', path: '/', pageHint: 'HomePage' },
  { name: 'Identify', path: '/identificar', pageHint: 'IdentifyPage' },
  { name: 'Encyclopedia', path: '/enciclopedia', pageHint: 'EncyclopediaPage' },
  { name: 'Species detail', path: '/enciclopedia/:slug', pageHint: 'SpeciesDetailPage' },
  { name: 'History/Notebook', path: '/historial', pageHint: 'HistoryPage' },
  { name: 'Map', path: '/mapa', pageHint: 'SpainMapPage' },
  { name: 'Education', path: '/educacion', pageHint: 'EducationPage' },
  { name: 'Offline pack', path: '/offline', pageHint: 'OfflinePackPage' },
  { name: 'Community', path: '/comunidad', pageHint: 'CommunityPage' },
  { name: 'Expert review', path: '/revision-experta', pageHint: 'ExpertReviewPage' },
  { name: 'Login', path: '/login', pageHint: 'LoginPage' },
  { name: 'Register', path: '/registro', pageHint: 'RegisterPage' },
  { name: 'Lookalike Studio', path: '/lookalikes', pageHint: 'LookalikeStudioPage' },
  { name: 'Quiz game', path: '/reto', pageHint: 'QuizGamePage' },
  { name: 'Setadle hub', path: '/setadle', pageHint: 'SetadlePage' },
  { name: 'Setadle mode', path: '/setadle/:mode', pageHint: 'SetadlePage' },
  { name: 'Mushroom Wordle', path: '/wordle', pageHint: 'MushroomWordlePage' },
  { name: 'ML dashboard', path: '/ml', pageHint: 'MlDashboardPage' },
  { name: 'Beta feedback', path: '/beta-feedback', pageHint: 'BetaFeedbackPage' },
  { name: 'Not found', path: '*', pageHint: 'NotFoundPage' },
]

describe('product surfaces routes', () => {
  const app = read('App.tsx')
  const header = read('components/Header.tsx')

  for (const s of SURFACES) {
    it(`wires ${s.name} (${s.path})`, () => {
      expect(app, s.name).toContain(s.pageHint)
      // detail route uses path pattern
      if (s.path.includes(':') && s.path.includes('slug')) {
        expect(app).toContain('enciclopedia/:slug')
      } else if (s.path.includes(':') && s.path.includes('mode')) {
        expect(app).toContain('setadle/:mode')
      } else if (s.path === '*') {
        expect(app).toContain('path="*"')
      } else if (s.path === '/') {
        expect(app).toMatch(/path=["']\/["']/)
      } else {
        expect(app).toContain(`path="${s.path}"`)
      }
    })
  }

  it('covers offline pack + PWA install chrome in shell', () => {
    expect(app).toContain('PwaInstallHint')
    expect(app).toContain('/offline')
    expect(app).toContain('OfflinePackPage')
  })

  it('header nav exposes primary discovery links', () => {
    for (const p of [
      '/identificar',
      '/enciclopedia',
      '/setadle',
      '/historial',
      '/mapa',
      '/educacion',
      '/offline',
      '/revision-experta',
      '/lookalikes',
      '/comunidad',
      '/reto',
    ]) {
      expect(header).toContain(`to: '${p}'`)
    }
  })

  it('header keeps 5 primaries + Más overflow hub (grouped)', () => {
    expect(header).toMatch(/primaryNav\s*=\s*\[/)
    expect(header).toMatch(/moreNavGroups/)
    expect(header).toMatch(/const moreNav/)
    expect(header).toContain('Más')
    expect(header).toContain('nav-more')
    expect(header).toContain('nav-more__group')
    expect(header).toMatch(
      /primaryNav\s*=\s*\[[\s\S]*?to: '\/identificar'[\s\S]*?to: '\/enciclopedia'[\s\S]*?to: '\/setadle'[\s\S]*?to: '\/mapa'[\s\S]*?\]/,
    )
    // Grouped hub still exposes all product destinations
    for (const p of [
      '/reto',
      '/lookalikes',
      '/historial',
      '/offline',
      '/educacion',
      '/comunidad',
      '/revision-experta',
      '/ml',
    ]) {
      expect(header).toContain(`to: '${p}'`)
    }
    expect(header).toMatch(/badge:\s*'dev'/)
  })

  it('ships feature modules for studio, notebook export, season, handoff', () => {
    expect(read('lib/lookalikeStudio.ts')).toMatch(/buildCompareRows/)
    expect(read('lib/observationHistory.ts')).toMatch(/exportHistoryJson/)
    expect(read('lib/seasonRadar.ts')).toMatch(/taxaForSeason/)
    expect(read('lib/expertHandoff.ts')).toMatch(/buildExpertHandoff/)
    expect(read('pages/LookalikeStudioPage.tsx')).toMatch(/Lookalike Studio/)
    expect(read('components/SeasonRadar.tsx')).toMatch(/SeasonRadar/)
    expect(read('components/ResultCard.tsx')).toMatch(/handleExpertHandoff|buildExpertHandoff/)
  })

  it('B-42: deadly/poisonous join visibility on real results (RiskChip boost + resolveJoinRisk)', () => {
    expect(read('lib/riskLabels.ts')).toMatch(/resolveJoinRisk/)
    expect(read('lib/riskLabels.ts')).toMatch(/isSevereRisk/)
    expect(read('components/RiskChip.tsx')).toMatch(/risk-chip--boost|boost/)
    expect(read('components/ResultCard.tsx')).toMatch(/resolveJoinRisk/)
    expect(read('components/ResultCard.tsx')).toMatch(/boostJoinRisk|mode === 'real'/)
    expect(read('components/ResultCard.tsx')).toMatch(/prediction-item--join-severe|risk-chip--boost|boost=/)
  })
})
