/**
 * Structural contracts: product hot paths are 2D photo encyclopedia, not 3D model studio.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8')
}

describe('no 3D model studio on primary product surfaces', () => {
  it('EncyclopediaPage does not import or mount PhotoSpin / 3D scene / studio spin', () => {
    const src = read('pages/EncyclopediaPage.tsx')
    expect(src).not.toMatch(/PhotoSpinViewer/)
    expect(src).not.toMatch(/MushroomScene3D/)
    expect(src).not.toMatch(/MushroomSpinViewer/)
    expect(src).not.toMatch(/studioOpen/)
    expect(src).not.toMatch(/ency-studio__spin/)
    expect(src).not.toMatch(/Vista 360|modelo 3d/i)
    expect(src).not.toMatch(/PhotoSpin|MushroomScene/)
    // Flat 2D featured path
    expect(src).toMatch(/ency-featured-flat/)
    expect(src).toMatch(/SpeciesPhotoCard/)
  })

  it('FeaturedMushroomCard and MushroomCard are flat (no live TiltCard3D / card-3d-tilt)', () => {
    const featured = read('components/FeaturedMushroomCard.tsx')
    const card = read('components/MushroomCard.tsx')
    expect(featured).not.toMatch(/import\s*\{[^}]*TiltCard3D/)
    expect(featured).not.toMatch(/<TiltCard3D/)
    expect(featured).toMatch(/featured-mushroom-card--flat|featured-mushroom-card/)
    expect(card).not.toMatch(/card-3d-tilt/)
    expect(card).toMatch(/className="mushroom-card/)
  })

  it('MushroomScene3D is a null stub (no user-facing 3D copy)', () => {
    const scene = read('components/MushroomScene3D.tsx')
    expect(scene).toMatch(/return null/)
    expect(scene).not.toMatch(/Vista 3D|WebGL|three\.js|canvas.*3d/i)
  })

  it('PhotoSpinViewer is a null stub (no 360 turntable / fake 3D studio)', () => {
    const spin = read('components/PhotoSpinViewer.tsx')
    expect(spin).toMatch(/return null/)
    expect(spin).not.toMatch(/resolveSpinPhotoSet|frameIndexFromDrag/)
    expect(spin).not.toMatch(/dragging|preloadImages|useState/)
  })

  it('mycology placeholder is flat text plate, not mushroom geometry', () => {
    const ph = read('data/mycologyPlaceholder.ts')
    expect(ph).toMatch(/Sin foto real/)
    expect(ph).not.toMatch(/ellipse cx=|circle cx=.*r=48/)
  })

  it('TiltCard3D is flat passthrough without preserve-3d class', () => {
    const tilt = read('components/TiltCard3D.tsx')
    expect(tilt).toMatch(/@deprecated|Flat passthrough|flat/i)
    expect(tilt).not.toMatch(/preserve-3d|perspective\(/)
    expect(tilt).not.toMatch(/tilt-card-css/)
  })

  it('HomePage / IdentifyPage do not mount MushroomScene3D', () => {
    const home = read('pages/HomePage.tsx')
    const id = read('pages/IdentifyPage.tsx')
    expect(home).not.toMatch(/MushroomScene3D|PhotoSpinViewer/)
    expect(id).not.toMatch(/MushroomScene3D/)
  })
})

describe('30-day try/GTM plan artifact', () => {
  it('docs/GTM_30_DAY_TRY_PLAN.md exists with week buckets, try language, safety', () => {
    const path = resolve(root, '../../docs/GTM_30_DAY_TRY_PLAN.md')
    const md = readFileSync(path, 'utf8')
    expect(md.length).toBeGreaterThan(800)
    // Day / week structure
    expect(md).toMatch(/Día 1|Day 1|Semana 1|D1/i)
    expect(md).toMatch(/Día 8|Semana 2|D8/i)
    expect(md).toMatch(/Día 15|Semana 3/i)
    expect(md).toMatch(/Día 22|Semana 4|30/i)
    // Try / beta first
    expect(md.toLowerCase()).toMatch(/prueb|beta|try|cohorte|waitlist/)
    // Safety
    expect(md.toLowerCase()).toMatch(/orientaci[oó]n|nunca.*consumo|never consumption|permiso de consumo/)
  })
})
