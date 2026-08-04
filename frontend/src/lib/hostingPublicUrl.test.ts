import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PUBLIC_APP_URL_ENV_KEY,
  PUBLIC_APP_URL_PLACEHOLDER,
  PUBLIC_APP_URL_POLICY,
  isPublicAppUrlConfigured,
  normalizePublicAppUrl,
  publicAppUrl,
  publicAppUrlForInvite,
  publicAppUrlFromEnv,
  resetPublicAppUrlEnvReaderForTests,
  setPublicAppUrlEnvReaderForTests,
} from './hostingPublicUrl'
import { betaInviteMessageEs, betaInviteMessageEn } from './betaFeedback'

const repoRoot = resolve(__dirname, '../../..')
const feRoot = resolve(__dirname, '../..')

afterEach(() => {
  resetPublicAppUrlEnvReaderForTests()
})

describe('normalizePublicAppUrl (pure)', () => {
  it('accepts https and strips trailing slash', () => {
    expect(normalizePublicAppUrl('https://beta.example/')).toBe('https://beta.example')
    expect(normalizePublicAppUrl('https://beta.example')).toBe('https://beta.example')
  })

  it('allows http only for localhost / 127.0.0.1', () => {
    expect(normalizePublicAppUrl('http://localhost:5173/')).toBe('http://localhost:5173')
    expect(normalizePublicAppUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000')
  })

  it('rejects production http and garbage', () => {
    expect(normalizePublicAppUrl('http://beta.example')).toBe('')
    expect(normalizePublicAppUrl('not-a-url')).toBe('')
    expect(normalizePublicAppUrl('ftp://x')).toBe('')
    expect(normalizePublicAppUrl('')).toBe('')
    expect(normalizePublicAppUrl(undefined)).toBe('')
    expect(normalizePublicAppUrl('  ')).toBe('')
  })
})

describe('hostingPublicUrl env integration', () => {
  it('policy is orientation-only and env key is stable', () => {
    expect(PUBLIC_APP_URL_POLICY).toBe('orientation_only_never_consume')
    expect(PUBLIC_APP_URL_ENV_KEY).toBe('VITE_PUBLIC_APP_URL')
    expect(PUBLIC_APP_URL_PLACEHOLDER).toMatch(/^https:\/\//)
  })

  it('env unset → not configured; invite uses placeholder', () => {
    expect(publicAppUrlFromEnv()).toBe('')
    expect(isPublicAppUrlConfigured()).toBe(false)
    expect(publicAppUrlForInvite()).toBe(PUBLIC_APP_URL_PLACEHOLDER)
    expect(publicAppUrl({ preferEnvOnly: true })).toBe(PUBLIC_APP_URL_PLACEHOLDER)
  })

  it('configured https env wires invite + strips slash', () => {
    // Vite bakes import.meta.env; inject raw reader (same path as production after bake)
    setPublicAppUrlEnvReaderForTests(() => 'https://beta.example.test/')
    expect(publicAppUrlFromEnv()).toBe('https://beta.example.test')
    expect(isPublicAppUrlConfigured()).toBe(true)
    expect(publicAppUrlForInvite()).toBe('https://beta.example.test')
    expect(publicAppUrl({ preferEnvOnly: true })).toBe('https://beta.example.test')
    const es = betaInviteMessageEs({})
    expect(es).toMatch(/https:\/\/beta\.example\.test/)
    expect(es).not.toContain(PUBLIC_APP_URL_PLACEHOLDER)
  })

  it('rejects non-https production env URL', () => {
    setPublicAppUrlEnvReaderForTests(() => 'http://beta.insecure.example')
    expect(publicAppUrlFromEnv()).toBe('')
    expect(isPublicAppUrlConfigured()).toBe(false)
    expect(publicAppUrlForInvite()).toBe(PUBLIC_APP_URL_PLACEHOLDER)
  })

  it('accepts localhost http for local preview', () => {
    setPublicAppUrlEnvReaderForTests(() => 'http://localhost:5173/')
    expect(publicAppUrlFromEnv()).toBe('http://localhost:5173')
    expect(isPublicAppUrlConfigured()).toBe(true)
  })

  it('publicAppUrl preferEnvOnly ignores window and keeps placeholder', () => {
    expect(publicAppUrl({ preferEnvOnly: true, placeholder: 'https://custom.test' })).toBe(
      'https://custom.test',
    )
  })

  it('invite helpers use public URL when appUrl omitted (placeholder)', () => {
    const es = betaInviteMessageEs({})
    expect(es).toContain(PUBLIC_APP_URL_PLACEHOLDER)
    expect(es.toLowerCase()).not.toMatch(/safe to eat|seguro para comer/)
    expect(es).toMatch(/orientaci[oó]n|No es permiso de consumo/i)
    const en = betaInviteMessageEn({})
    expect(en).toContain(PUBLIC_APP_URL_PLACEHOLDER)
    expect(en.toLowerCase()).not.toMatch(/safe to eat/)
  })

  it('invite helpers still honor explicit appUrl override', () => {
    const es = betaInviteMessageEs({ appUrl: 'https://beta.example.test/' })
    expect(es).toMatch(/https:\/\/beta\.example\.test/)
    expect(es).not.toContain('//beta.example.test/')
  })

  it('invite explicit appUrl goes through normalize (reject http prod / garbage)', () => {
    const badHttp = betaInviteMessageEs({ appUrl: 'http://beta.insecure.example' })
    expect(badHttp).toContain(PUBLIC_APP_URL_PLACEHOLDER)
    expect(badHttp).not.toMatch(/http:\/\/beta\.insecure/)
    const junk = betaInviteMessageEs({ appUrl: 'not-a-url' })
    expect(junk).toContain(PUBLIC_APP_URL_PLACEHOLDER)
    const local = betaInviteMessageEs({ appUrl: 'http://localhost:5173/' })
    expect(local).toMatch(/http:\/\/localhost:5173/)
  })
})

describe('hosting deploy beta kit contracts', () => {
  it('HOSTING_DEPLOY_BETA Path A Caddy default + safety', () => {
    const doc = readFileSync(resolve(repoRoot, 'docs/HOSTING_DEPLOY_BETA.md'), 'utf8')
    expect(doc).toMatch(/Path A/)
    expect(doc).toMatch(/Caddy|deploy\/Caddyfile/)
    expect(doc).toMatch(/PWA|Añadir a pantalla de inicio/i)
    expect(doc).toMatch(/HTTPS/i)
    expect(doc).toMatch(/orientation only|orientaci[oó]n only/i)
    expect(doc.toLowerCase()).toMatch(/safe to eat|seguro para comer|permiso de consumo/)
    expect(doc).toMatch(/VITE_PUBLIC_APP_URL/)
    expect(doc).toMatch(/product_unlock.*(false|operator)|stays \*\*false\*\*|remains false/i)
    expect(doc).toMatch(/App Store|Play Store|APK/i)
    expect(doc).toMatch(/checklist/i)
  })

  it('deploy artifacts exist (Caddy + SPA rewrites + navigateFallback)', () => {
    const caddy = readFileSync(resolve(repoRoot, 'deploy/Caddyfile'), 'utf8')
    expect(caddy).toMatch(/try_files/)
    expect(caddy).toMatch(/\/api/)
    expect(caddy).toMatch(/\/media/)
    expect(caddy).toMatch(/dist-app/)
    const redirects = readFileSync(resolve(feRoot, 'public/_redirects'), 'utf8')
    expect(redirects).toMatch(/index\.html/)
    const vercel = readFileSync(resolve(feRoot, 'vercel.json'), 'utf8')
    expect(vercel).toMatch(/index\.html/)
    const vite = readFileSync(resolve(feRoot, 'vite.config.ts'), 'utf8')
    expect(vite).toMatch(/navigateFallback:\s*['"]index\.html['"]/)
  })

  it('SPA dual-build emits index.html via emitSpaIndexHtmlPlugin', () => {
    const vite = readFileSync(resolve(feRoot, 'vite.config.ts'), 'utf8')
    expect(vite).toMatch(/function emitSpaIndexHtmlPlugin/)
    expect(vite).toMatch(/emitSpaIndexHtmlPlugin\(target\)/)
    expect(vite).toMatch(/fileName\s*=\s*['"]index\.html['"]/)
    expect(vite).toMatch(/index-\$\{target\}\.html/)
    expect(vite).toMatch(/navigateFallback:\s*['"]index\.html['"]/)
    const hosting = readFileSync(resolve(repoRoot, 'docs/HOSTING_DEPLOY_BETA.md'), 'utf8')
    expect(hosting).toMatch(/build:app/)
    expect(hosting).toMatch(/FRONTEND_DIST=\\.\/frontend\/dist-app|FRONTEND_DIST=\.\/frontend\/dist-app/)
  })

  it('env examples + Home install + public URL ops surface (dev-only)', () => {
    const feEnv = readFileSync(resolve(feRoot, '.env.example'), 'utf8')
    expect(feEnv).toMatch(/VITE_API_URL/)
    expect(feEnv).toMatch(/VITE_PUBLIC_APP_URL/)
    expect(feEnv).toMatch(/VITE_BETA_FEEDBACK_URL/)
    const home = readFileSync(resolve(feRoot, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-install-guide/)
    expect(home).toMatch(/isPublicAppUrlConfigured/)
    expect(home).toMatch(/home-public-url-missing/)
    expect(home).toMatch(/publicAppUrl/)
    // Cohort users must not see ops env chrome in production builds
    expect(home).toMatch(/import\.meta\.env\.DEV/)
    expect(home).toMatch(/showOpsPublicUrlChrome|data-ops-only/)
  })

  it('GTM paste invite includes install line', () => {
    const gtm = readFileSync(resolve(repoRoot, 'docs/GTM_BETA_COHORT.md'), 'utf8')
    expect(gtm).toMatch(/Añadir a pantalla de inicio/)
    expect(gtm).toMatch(/Instalar app/)
  })
})
