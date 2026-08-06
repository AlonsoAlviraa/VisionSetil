/**
 * UX-08 — prefers-reduced-motion (PRM) CSS guards for decorative motion.
 * Source contracts (no browser) so CI catches missing PRM blocks.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = resolve(__dirname, '../styles')

function readCss(name: string) {
  return readFileSync(resolve(styles, name), 'utf8')
}

describe('reduced-motion CSS contracts (UX-08 PRM)', () => {
  it('tokens zero duration scale under PRM', () => {
    const css = readCss('tokens.css')
    expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/)
    expect(css).toMatch(/--duration-fast:\s*0ms/)
    expect(css).toMatch(/--duration-normal:\s*0ms/)
    expect(css).toMatch(/--duration-slow:\s*0ms/)
  })

  it('animations.css kills decorative spore / aurora / mushroom spin under PRM', () => {
    const css = readCss('animations.css')
    expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/)
    // Explicit decorative kill list
    for (const sel of [
      'spore-particles',
      'spore-particles-css',
      'mushroom-auto-rotate',
      'bg-aurora',
    ]) {
      expect(css, sel).toMatch(new RegExp(sel))
    }
    // Global collapse
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
  })

  it('campo-nocturno + marketing + global include PRM blocks', () => {
    for (const file of ['campo-nocturno.css', 'marketing.css', 'global.css']) {
      const css = readCss(file)
      expect(css, file).toMatch(/prefers-reduced-motion:\s*reduce/)
    }
  })

  it('photo-coach decorative blur filter is killed under PRM', () => {
    const css = readCss('campo-nocturno.css')
    // Photo coach PRM: shadow-blur wire loses filter
    expect(css).toMatch(/photo-coach-frame--shadow-blur[\s\S]*?prefers-reduced-motion|prefers-reduced-motion[\s\S]*?photo-coach-frame--shadow-blur/)
  })
})
