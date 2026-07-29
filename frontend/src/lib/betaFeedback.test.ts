import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BETA_COHORT_CHECKLIST,
  BETA_COHORT_SEGMENTS,
  BETA_FEEDBACK_MAILTO,
  betaFeedbackConfig,
  betaFeedbackFormUrl,
  betaFeedbackHref,
  betaInviteMessageEn,
  betaInviteMessageEs,
  isBetaMailto,
  resolveInviteAppUrl,
} from './betaFeedback'
import { PUBLIC_APP_URL_PLACEHOLDER } from './hostingPublicUrl'

const root = resolve(__dirname, '../..')

describe('betaFeedback (GTM try-first)', () => {
  it('defaults to in-app form when no VITE_BETA_FEEDBACK_URL', () => {
    expect(betaFeedbackFormUrl()).toBe('')
    const href = betaFeedbackHref()
    expect(href).toBe('/beta-feedback')
    expect(isBetaMailto(href)).toBe(false)
    expect(href).toMatch(/feedback/i)
  })

  it('mailto body prompts what was tried / what failed (ES)', () => {
    expect(decodeURIComponent(BETA_FEEDBACK_MAILTO)).toMatch(/Qu[eé] prob/i)
    expect(decodeURIComponent(BETA_FEEDBACK_MAILTO)).toMatch(/fall/i)
  })

  it('betaFeedbackConfig is fail-open for try and policy-safe', () => {
    const c = betaFeedbackConfig()
    expect(c.policy).toBe('orientation_only_never_consume')
    expect(c.formConfigured).toBe(false)
    expect(c.formReady).toBe(true)
    expect(c.source).toBe('in_app')
    expect(c.href).toBe('/beta-feedback')
    expect(isBetaMailto(c.href)).toBe(false)
  })

  it('cohort kit has segments + checklist + invite copy (never edible)', () => {
    expect(BETA_COHORT_SEGMENTS.length).toBeGreaterThanOrEqual(4)
    expect(BETA_COHORT_CHECKLIST).toContain('orientation_only_copy')
    expect(BETA_COHORT_CHECKLIST).toContain('invite_20_40_people')
    expect(BETA_COHORT_CHECKLIST).toContain('hosting_path_a_or_b')
    expect(BETA_COHORT_CHECKLIST).toContain('vite_public_app_url')
    expect(BETA_COHORT_CHECKLIST).toContain('pwa_install_guidance')
    const es = betaInviteMessageEs({
      appUrl: 'https://example.test',
      formUrl: 'https://forms.example/x',
    })
    expect(es).toMatch(/orientaci[oó]n|No es permiso de consumo/i)
    expect(es).toMatch(/https:\/\/example\.test/)
    expect(es).toMatch(/https:\/\/forms\.example\/x/)
    expect(es).toMatch(/Añadir a pantalla de inicio|Instalar app/i)
    expect(es.toLowerCase()).not.toMatch(/safe to eat|seguro para comer/)
    const en = betaInviteMessageEn({ appUrl: 'https://example.test' })
    expect(en.toLowerCase()).toMatch(/orientation|not forage|not.*consumption/)
    expect(en.toLowerCase()).not.toMatch(/safe to eat/)
  })

  it('resolveInviteAppUrl normalizes explicit override (https policy)', () => {
    expect(resolveInviteAppUrl('https://beta.ok.example/')).toBe('https://beta.ok.example')
    expect(resolveInviteAppUrl('http://evil.example')).toBe(PUBLIC_APP_URL_PLACEHOLDER)
    expect(resolveInviteAppUrl('garbage')).toBe(PUBLIC_APP_URL_PLACEHOLDER)
  })

  it('GTM cohort doc + env templates exist', () => {
    const doc = readFileSync(resolve(root, '../docs/GTM_BETA_COHORT.md'), 'utf8')
    expect(doc).toMatch(/VITE_BETA_FEEDBACK_URL/)
    expect(doc).toMatch(/HOSTING_DEPLOY_BETA/)
    expect(doc).toMatch(/VITE_PUBLIC_APP_URL/)
    expect(doc).toMatch(/orientation only|orientaci/i)
    // Doc may mention forbidden phrases in a denylist line; product invite must not claim them.
    expect(doc.toLowerCase()).toMatch(/forbidden|nunca|never/)
    const feEnv = readFileSync(resolve(root, '.env.example'), 'utf8')
    expect(feEnv).toMatch(/VITE_BETA_FEEDBACK_URL/)
    expect(feEnv).toMatch(/VITE_PUBLIC_APP_URL/)
    expect(feEnv).toMatch(/VITE_API_URL/)
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/betaFeedbackConfig/)
    expect(home).toMatch(/home-beta-feedback-source/)
    expect(home).toMatch(/home-install-guide/)
    expect(home).toMatch(/isPublicAppUrlConfigured|home-public-url-missing/)
    expect(doc).toMatch(/Añadir a pantalla de inicio/)
  })
})
