/**
 * Dual-shell photo path contracts (app 5173 + web 5174 share Identify sources).
 * Prevents app-only regressions where gallery inputs force capture=environment
 * (blocks photo library on iOS/Android WebView while desktop web still works).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = join(process.cwd(), 'src')

function readSrc(rel: string): string {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('photo upload dual-shell parity', () => {
  it('app and web entries both mount App + hydrate photos', () => {
    const app = readSrc('main-app.tsx')
    const web = readSrc('main-web.tsx')
    expect(app).toMatch(/from ['\"]\.\/App/)
    expect(web).toMatch(/from ['\"]\.\/App/)
    expect(app).toMatch(/hydrateSpeciesPhotos/)
    expect(web).toMatch(/hydrateSpeciesPhotos/)
    // App is phone-first without web skin layer (import statement only)
    expect(app).not.toMatch(/import\s+['\"]\.\/styles\/campo-nocturno-web\.css['\"]/)
    expect(web).toMatch(/import\s+['\"]\.\/styles\/campo-nocturno-web\.css['\"]/)
  })

  it('wizard gallery file inputs do not force capture=environment', () => {
    const wiz = readSrc('components/MultiViewWizard.tsx')
    // Gallery path must be library-friendly (no capture attribute on the file input)
    expect(wiz).toMatch(/data-testid=\{`mv-gallery-input-\$\{slot\.view\}`\}/)
    // Attribute form only — comments may mention capture without setting the attribute
    expect(wiz).not.toMatch(/type=["']file["'][^>]*\bcapture\s*=/)
    expect(wiz).not.toMatch(/capture=["']environment["']/)
  })

  it('free-mode dropzone accepts images without capture lock', () => {
    const page = readSrc('pages/IdentifyPage.tsx')
    expect(page).toMatch(/useDropzone/)
    expect(page).toMatch(/accept:\s*\{\s*['\"]image\/\*['\"]/)
    // Dropzone config block should not force capture
    const drop = page.match(/useDropzone\(\{[\s\S]{0,400}?\}\)/)
    expect(drop).toBeTruthy()
    expect(drop![0]).not.toMatch(/\bcapture\b/)
  })

  it('CameraCapture uses getUserMedia with bounded resolution', () => {
    const cam = readSrc('components/CameraCapture.tsx')
    expect(cam).toMatch(/getUserMedia/)
    expect(cam).toMatch(/1280/)
    expect(cam).toMatch(/facingMode/)
  })

  it('UploadZone and MultiViewWizard are shared (no shell forks)', () => {
    const identify = readSrc('pages/IdentifyPage.tsx')
    expect(identify).toMatch(/UploadZone|MultiViewWizard/)
    expect(identify).toMatch(/from ['\"].*MultiViewWizard/)
  })
})
