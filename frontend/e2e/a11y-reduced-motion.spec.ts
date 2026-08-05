/**
 * UX-08 / PR-18 — prefers-reduced-motion (PRM) kills decorative motion.
 *
 * Matrix: app :5173 + web :5174 (Playwright projects).
 * Asserts CSS durations collapse under PRM; orientation chrome still readable.
 */
import { test, expect } from '@playwright/test'

test.describe('a11y reduced-motion (PRM)', () => {
  test('PRM collapses decorative animation/transition durations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/juegos')
    await expect(page.getByTestId('games-hub-page')).toBeVisible({ timeout: 30_000 })

    const metrics = await page.evaluate(() => {
      const pick = (sel: string) => document.querySelector(sel) as HTMLElement | null
      const samples: Array<{ sel: string; anim: string; transition: string }> = []
      for (const sel of [
        '[data-testid="games-hub-page"]',
        '.mkt-mesh',
        '.cn-glass',
        '.spore-particles',
        '.spore-particles-css',
        '.bg-aurora',
        'body',
      ]) {
        const el = pick(sel)
        if (!el) continue
        const cs = getComputedStyle(el)
        samples.push({
          sel,
          anim: cs.animationDuration,
          transition: cs.transitionDuration,
        })
      }
      // Also probe ::before on mesh if present
      const mesh = pick('.mkt-mesh')
      if (mesh) {
        const before = getComputedStyle(mesh, '::before')
        samples.push({
          sel: '.mkt-mesh::before',
          anim: before.animationDuration,
          transition: before.transitionDuration,
        })
      }
      return samples
    })

    expect(metrics.length).toBeGreaterThan(0)
    for (const m of metrics) {
      // Global PRM rules set ~0.01ms (parsed as 0s or tiny ms)
      const animMs = parseDurationToMs(m.anim)
      const transMs = parseDurationToMs(m.transition)
      expect(animMs, `${m.sel} animationDuration=${m.anim}`).toBeLessThan(50)
      expect(transMs, `${m.sel} transitionDuration=${m.transition}`).toBeLessThan(50)
    }
  })

  test('PRM identify coach remains usable (no forage, orientation present)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/identificar')
    await expect(page.getByTestId('identify-page')).toBeVisible({ timeout: 30_000 })

    // PhotoCoach is on guided multi-view (free mode is default)
    await page.getByTestId('identify-mode-guided').click()
    await expect(page.getByTestId('photo-coach-panel')).toBeVisible({ timeout: 20_000 })
    const toggle = page.getByTestId('photo-coach-toggle')
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await toggle.click()
    }
    await expect(page.getByTestId('photo-coach-body')).toBeVisible()
    await expect(page.locator('[data-testid^="photo-coach-wire-"]').first()).toBeVisible()

    const text = await page.getByTestId('identify-page').innerText()
    expect(text).toMatch(/orientaci|nunca consumo|never consum/i)
    expect(text.toLowerCase()).not.toMatch(/safe to eat|product_unlock\s*=\s*true/)
  })
})

/** Parse CSS time list ("0.01ms, 0s") → max duration in ms. */
function parseDurationToMs(value: string): number {
  if (!value || value === 'normal' || value === 'initial') return 0
  const parts = value.split(',').map((p) => p.trim())
  let max = 0
  for (const p of parts) {
    if (!p || p === '0') {
      max = Math.max(max, 0)
      continue
    }
    const m = p.match(/^([\d.]+)(m?s)$/i)
    if (!m) continue
    const n = Number(m[1])
    const unit = m[2].toLowerCase()
    const ms = unit === 's' ? n * 1000 : n
    if (ms > max) max = ms
  }
  return max
}
