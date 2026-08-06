/**
 * UX-08 — Dual-shell contract: app + web share pages + navConfig SSOT.
 *
 * Shells differ only by entry CSS layer + forced layout mode.
 * No product_unlock coupling.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOTTOM_TABS, PRIMARY_NAV, headerPrimaryNav } from './navConfig'

const root = resolve(__dirname, '../..')

function read(rel: string) {
  return readFileSync(resolve(root, 'src', rel), 'utf8')
}

function readRoot(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8')
}

describe('dual-shell shared surface contracts (UX-08)', () => {
  it('app and web entries both mount App with forced layout mode', () => {
    const app = read('main-app.tsx')
    const web = read('main-web.tsx')
    expect(app).toMatch(/from '\.\/App/)
    expect(web).toMatch(/from '\.\/App/)
    expect(app).toMatch(/FORCED_LAYOUT_MODE/)
    expect(web).toMatch(/FORCED_LAYOUT_MODE/)
    expect(app).toMatch(/forcedMode=\{FORCED_LAYOUT_MODE \?\? 'app'\}/)
    expect(web).toMatch(/forcedMode=\{FORCED_LAYOUT_MODE \?\? 'web'\}/)
  })

  it('web imports campo-nocturno-web; app does not import it', () => {
    const app = read('main-app.tsx')
    const web = read('main-web.tsx')
    // Import form only (comments may mention the web layer)
    expect(web).toMatch(/import\s+['"].*campo-nocturno-web\.css['"]/)
    expect(app).not.toMatch(/import\s+['"].*campo-nocturno-web\.css['"]/)
    // Shared product skin
    expect(app).toMatch(/import\s+['"].*campo-nocturno\.css['"]/)
    expect(web).toMatch(/import\s+['"].*campo-nocturno\.css['"]/)
    expect(app).toMatch(/import\s+['"].*tokens\.css['"]/)
    expect(web).toMatch(/import\s+['"].*tokens\.css['"]/)
  })

  it('App.tsx routes learning-first pages used by both shells', () => {
    const app = read('App.tsx')
    for (const page of [
      'GamesHubPage',
      'IdentifyPage',
      'EncyclopediaPage',
      'HomePage',
      'MoreHubPage',
      'EducationPage',
    ]) {
      expect(app, page).toContain(page)
    }
    for (const path of ['/juegos', '/identificar', '/enciclopedia', '/mas', '/educacion']) {
      expect(app).toContain(`path="${path}"`)
    }
  })

  it('navConfig is SSOT for Header + BottomNav (shared across shells)', () => {
    const header = read('components/Header.tsx')
    const bottom = read('components/BottomNav.tsx')
    expect(header).toMatch(/from ['"].*navConfig['"]/)
    expect(bottom).toMatch(/from ['"].*navConfig['"]/)
    expect(header).toMatch(/PRIMARY_NAV|headerPrimaryNav|MORE_NAV/)
    expect(bottom).toMatch(/BOTTOM_TABS/)

    // Runtime SSOT shape
    expect(BOTTOM_TABS).toHaveLength(5)
    expect(BOTTOM_TABS.map((t) => t.to)).toEqual([
      '/',
      '/identificar',
      '/juegos',
      '/enciclopedia',
      '/mas',
    ])
    expect(PRIMARY_NAV.some((i) => i.to === '/juegos')).toBe(true)
    expect(headerPrimaryNav().some((i) => i.to === '/mapa' && i.headerOnly)).toBe(true)
  })

  it('Vite dual ports 5173 app / 5174 web are configured', () => {
    const vite = readRoot('vite.config.ts')
    expect(vite).toMatch(/5173/)
    expect(vite).toMatch(/5174/)
    expect(vite).toMatch(/createViteConfig/)
    const webCfg = readRoot('vite.web.config.ts')
    expect(webCfg).toMatch(/createViteConfig\('web'\)/)
  })

  it('Playwright dual-shell projects matrix is wired', () => {
    const pw = readRoot('playwright.config.ts')
    expect(pw).toMatch(/name:\s*['"]app['"]/)
    expect(pw).toMatch(/name:\s*['"]web['"]/)
    expect(pw).toMatch(/5173/)
    expect(pw).toMatch(/5174/)
    expect(pw).toMatch(/dev:app|dev:web/)
    expect(pw).toMatch(/learning-first-dual-shell|a11y-reduced-motion|identify-photo-dual-shell/)
  })

  it('Identify photo path is shared (no shell-specific UploadZone/Camera/Wizard forks)', () => {
    // Both entries mount the same App → IdentifyPage; no main-app photo fork.
    const app = read('main-app.tsx')
    const web = read('main-web.tsx')
    expect(app).not.toMatch(/UploadZone|CameraCapture|MultiViewWizard|IdentifyPage/)
    expect(web).not.toMatch(/UploadZone|CameraCapture|MultiViewWizard|IdentifyPage/)
    expect(app).toMatch(/from '\.\/App/)
    expect(web).toMatch(/from '\.\/App/)

    const identify = read('pages/IdentifyPage.tsx')
    expect(identify).toMatch(/from ['"].*UploadZone['"]/)
    expect(identify).toMatch(/from ['"].*CameraCapture['"]/)
    expect(identify).toMatch(/from ['"].*MultiViewWizard['"]/)
    expect(identify).toMatch(/prepareIdentifyImageFile/)
    expect(identify).toMatch(/data-testid="identify-submit"/)
    expect(identify).toMatch(/identify-sticky-cta|analyze-actions/)

    const upload = read('components/UploadZone.tsx')
    const cam = read('components/CameraCapture.tsx')
    const wiz = read('components/MultiViewWizard.tsx')
    expect(upload).toMatch(/data-testid="upload-dropzone"/)
    expect(upload).toMatch(/data-testid="upload-open-camera"/)
    expect(cam).toMatch(/IDENTIFY_JPEG_MAX_EDGE|maxEdge/)
    expect(cam).toMatch(/getUserMedia/)
    expect(wiz).toMatch(/data-testid="multi-view-wizard"/)
    expect(wiz).toMatch(/PhotoCoachPanel/)
    // App-shell regression lock: gallery must not force rear camera
    expect(wiz).not.toMatch(/capture\s*=\s*["']environment["']/)
    expect(wiz).toMatch(/prepareIdentifyImageFile/)
  })

  it('PWA is app-shell only; web shell has no service worker plugin path', () => {
    const vite = readRoot('vite.config.ts')
    // Factory enables VitePWA only when target !== web
    expect(vite).toMatch(/VitePWA|vite-plugin-pwa/)
    expect(vite).toMatch(/isWeb/)
    expect(vite).toMatch(/dist-\$\{target\}|dist-app|dist-web/)
    const webCfg = readRoot('vite.web.config.ts')
    expect(webCfg).toMatch(/createViteConfig\('web'\)/)
  })
})
