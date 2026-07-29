/**
 * Public shareable app URL for beta invites / GTM / Home ops chrome.
 * Prefer VITE_PUBLIC_APP_URL (bake-time). Orientation only — never consumption claims.
 *
 * Production invites: https only. http allowed only for localhost / 127.0.0.1.
 */

export const PUBLIC_APP_URL_ENV_KEY = 'VITE_PUBLIC_APP_URL' as const

/** Placeholder when operator has not set a real preview URL yet. */
export const PUBLIC_APP_URL_PLACEHOLDER = 'https://app.visionsetil.local'

export const PUBLIC_APP_URL_POLICY = 'orientation_only_never_consume' as const

/**
 * Accept public app URLs for invites / env.
 * - https://… always OK
 * - http:// only for localhost / 127.0.0.1 / ::1 (local dev)
 * - strips trailing slash
 * Pure helper — unit-tested without Vite env.
 */
export function normalizePublicAppUrl(raw: string | undefined | null): string {
  if (raw == null) return ''
  const trimmed = String(raw).trim()
  if (!trimmed) return ''
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return ''
  }
  const proto = parsed.protocol.toLowerCase()
  const host = parsed.hostname.toLowerCase()
  if (proto === 'https:') {
    return trimmed.replace(/\/$/, '')
  }
  if (proto === 'http:') {
    const local =
      host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
    if (local) return trimmed.replace(/\/$/, '')
  }
  return ''
}

type RawEnvReader = () => string | undefined

const defaultRawEnvReader: RawEnvReader = () => {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    const v = env?.VITE_PUBLIC_APP_URL
    if (v != null && String(v).length) return String(v)
  } catch {
    /* non-vite */
  }
  return undefined
}

/** Test seam: Vite bakes import.meta.env so vi.stubEnv alone is unreliable. */
let rawEnvReader: RawEnvReader = defaultRawEnvReader

/** @internal Vitest only — restore with resetPublicAppUrlEnvReaderForTests(). */
export function setPublicAppUrlEnvReaderForTests(reader: RawEnvReader | null): void {
  rawEnvReader = reader ?? defaultRawEnvReader
}

/** @internal */
export function resetPublicAppUrlEnvReaderForTests(): void {
  rawEnvReader = defaultRawEnvReader
}

function readEnvPublicAppUrl(): string {
  return normalizePublicAppUrl(rawEnvReader())
}

/** True when VITE_PUBLIC_APP_URL is a valid allowed public URL. */
export function isPublicAppUrlConfigured(): boolean {
  return Boolean(readEnvPublicAppUrl())
}

/**
 * Env-only public URL (empty string if unset / invalid).
 * Use for invite bake and ops checks — does not invent localhost as “production”.
 */
export function publicAppUrlFromEnv(): string {
  return readEnvPublicAppUrl()
}

export type PublicAppUrlOptions = {
  /**
   * When true, never fall back to window.location (invite templates, SSR-safe).
   * Default false: browser may use current origin for share / install chrome.
   */
  preferEnvOnly?: boolean
  /** Override placeholder when env missing (tests). */
  placeholder?: string
}

/**
 * Best-effort public app origin for share / install guidance on Home.
 * Order: VITE_PUBLIC_APP_URL → (optional) window.location.origin (if allowed) → placeholder.
 */
export function publicAppUrl(opts: PublicAppUrlOptions = {}): string {
  const fromEnv = readEnvPublicAppUrl()
  if (fromEnv) return fromEnv

  const placeholder = opts.placeholder ?? PUBLIC_APP_URL_PLACEHOLDER

  if (!opts.preferEnvOnly) {
    try {
      if (typeof window !== 'undefined' && window.location?.origin) {
        const o = normalizePublicAppUrl(String(window.location.origin))
        if (o) return o
      }
    } catch {
      /* ignore */
    }
  }

  return placeholder
}

/**
 * URL string for invite messages: env if set, else explicit placeholder
 * so operators notice misconfiguration instead of leaking a random origin.
 * Prefer passing explicit appUrl to betaInviteMessageEs when env is not baked.
 */
export function publicAppUrlForInvite(): string {
  return publicAppUrlFromEnv() || PUBLIC_APP_URL_PLACEHOLDER
}
