/**
 * Beta / try-first feedback entry points (GTM 30-day plan).
 * Configurable form URL via VITE_BETA_FEEDBACK_URL; mailto fallback.
 * App link via VITE_PUBLIC_APP_URL (see hostingPublicUrl.ts).
 * Orientation only — never consumption permission.
 */

import { normalizePublicAppUrl, publicAppUrlForInvite } from './hostingPublicUrl'

export const BETA_FEEDBACK_MAILTO =
  'mailto:alonso.alvbal@gmail.com?subject=VisionSetil%20beta%20feedback&body=Qu%C3%A9%20prob%C3%A9%3A%0AQu%C3%A9%20fall%C3%B3%3A%0A'

/** In-app form route (no Google Forms MCP required). */
export const BETA_FEEDBACK_APP_PATH = '/beta-feedback'

export type BetaFeedbackSource = 'env_form' | 'in_app' | 'mailto_fallback'

export type BetaFeedbackConfig = {
  href: string
  formUrl: string
  source: BetaFeedbackSource
  /** True only when VITE_BETA_FEEDBACK_URL is a valid https?/http URL. */
  formConfigured: boolean
  /** True when env form OR in-app form is used (not bare mailto). */
  formReady: boolean
  policy: 'orientation_only_never_consume'
}

function readEnvFormUrl(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    const v = env?.VITE_BETA_FEEDBACK_URL
    if (v && /^https?:\/\//i.test(v.trim())) return v.trim()
  } catch {
    /* non-vite */
  }
  return ''
}

/** Optional public form (Google Form, Typeform, etc.). */
export function betaFeedbackFormUrl(): string {
  return readEnvFormUrl()
}

/** Preferred href for “Enviar feedback beta” CTAs. */
export function betaFeedbackHref(): string {
  // Priority: Google/Typeform env → in-app form → mailto fallback
  return betaFeedbackFormUrl() || BETA_FEEDBACK_APP_PATH
}

export function isBetaMailto(href: string = betaFeedbackHref()): boolean {
  return href.toLowerCase().startsWith('mailto:')
}

export function isBetaExternalForm(href: string = betaFeedbackHref()): boolean {
  return /^https?:\/\//i.test(href)
}

/** Machine-readable config for Home / ops / tests. */
export function betaFeedbackConfig(): BetaFeedbackConfig {
  const formUrl = betaFeedbackFormUrl()
  const formConfigured = Boolean(formUrl)
  if (formConfigured) {
    return {
      href: formUrl,
      formUrl,
      source: 'env_form',
      formConfigured: true,
      formReady: true,
      policy: 'orientation_only_never_consume',
    }
  }
  return {
    href: BETA_FEEDBACK_APP_PATH,
    formUrl: '',
    source: 'in_app',
    formConfigured: false,
    formReady: true,
    policy: 'orientation_only_never_consume',
  }
}

/** Closed-cohort invite segments (GTM D3–4). */
export const BETA_COHORT_SEGMENTS = [
  {
    id: 'field_friends',
    es: '5–10 amigos de campo',
    en: '5–10 field friends',
    whyEs: 'fotos reales multi-vista',
  },
  {
    id: 'mycologists',
    es: '5 micólogos / aficionados serios',
    en: '5 mycologists / serious amateurs',
    whyEs: 'feedback de seguridad y open-set',
  },
  {
    id: 'cotos',
    es: '5 partners cotos / asociaciones',
    en: '5 coto / association partners',
    whyEs: 'probar mapa y enlaces oficiales',
  },
  {
    id: 'community',
    es: '5–10 LinkedIn / comunidad',
    en: '5–10 LinkedIn / community',
    whyEs: 'alcance medio try-first',
  },
] as const

/** Operator checklist items for beta launch (product-side). */
export const BETA_COHORT_CHECKLIST = [
  'hosting_path_a_or_b',
  'preview_url_stable',
  'vite_public_app_url',
  'vite_beta_feedback_url_or_mailto',
  'home_try_cta',
  'pwa_install_guidance',
  'orientation_only_copy',
  'invite_20_40_people',
  'ask_1_identify_1_encyclopedia',
  'collect_qualitative_feedback',
] as const

/**
 * Resolve invite app link: explicit appUrl through https policy, else env/placeholder.
 * Rejects production http and non-URLs (same rules as VITE_PUBLIC_APP_URL).
 */
export function resolveInviteAppUrl(appUrl?: string): string {
  return normalizePublicAppUrl(appUrl) || publicAppUrlForInvite()
}

/**
 * WhatsApp/email invite text (ES). Pass appUrl + optional formUrl.
 * Defaults appUrl from VITE_PUBLIC_APP_URL (see publicAppUrlForInvite).
 * Explicit appUrl is normalized (https only; localhost http OK).
 * Never claims edible clearance.
 */
export function betaInviteMessageEs(opts: {
  appUrl?: string
  formUrl?: string
} = {}): string {
  const app = resolveInviteAppUrl(opts.appUrl)
  const cfg = betaFeedbackConfig()
  const form = opts.formUrl || cfg.formUrl || '(configura VITE_BETA_FEEDBACK_URL o usa mailto del footer)'
  return [
    'Estamos abriendo beta privada de VisionSetil (ID de setas con honestidad de modelo + enciclopedia Iberia).',
    'No es permiso de consumo — solo orientación de campo. Si puedes probar ~10 min y decirnos qué falla, te lo agradecemos.',
    `Link: ${app}`,
    `Feedback: ${form}`,
    'En el móvil: abre el link → (iOS) Compartir → «Añadir a pantalla de inicio» · (Android Chrome) menú → Instalar app.',
    'Pide: 1 Identify multi-foto + 1 ficha de enciclopedia (opcional Wordle/Setadle).',
  ].join('\n')
}

export function betaInviteMessageEn(opts: {
  appUrl?: string
  formUrl?: string
} = {}): string {
  const app = resolveInviteAppUrl(opts.appUrl)
  const cfg = betaFeedbackConfig()
  const form = opts.formUrl || cfg.formUrl || '(set VITE_BETA_FEEDBACK_URL or use footer mailto)'
  return [
    'We are opening a private VisionSetil beta (mushroom ID with model honesty + Iberia encyclopedia).',
    'Not forage/consumption permission — field orientation only. ~10 min try + tell us what breaks.',
    `Link: ${app}`,
    `Feedback: ${form}`,
    'On phone: open the link → (iOS) Share → Add to Home Screen · (Android Chrome) menu → Install app.',
    'Ask: 1 multi-photo Identify + 1 encyclopedia sheet (optional Wordle/Setadle).',
  ].join('\n')
}
