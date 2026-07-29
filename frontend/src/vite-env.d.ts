/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_KEY?: string
  /** Public HTTPS app URL for invites / GTM (see docs/HOSTING_DEPLOY_BETA.md). */
  readonly VITE_PUBLIC_APP_URL?: string
  /** Beta cohort feedback form (Google Form / Typeform). */
  readonly VITE_BETA_FEEDBACK_URL?: string
  readonly VITE_MEDIA_PUBLIC_PREFIX?: string
  readonly VITE_FEATURE_SPECIES_MEDIA?: string
  readonly VITE_FEATURE_I18N?: string
  readonly VITE_FEATURE_UNIFIED_CATALOG?: string
  readonly VITE_FEATURE_GUIDED_IDENTIFY?: string
  readonly VITE_FEATURE_OFFLINE_PACK?: string
  readonly VITE_FEATURE_FAVORITES?: string
  /** B-46: optional async classify + polling (default off). */
  readonly VITE_FEATURE_ASYNC_CLASSIFY?: string
  /** E-08: HttpOnly cookie sessions (opt-in; pair with AUTH_COOKIE_ENABLED). */
  readonly VITE_FEATURE_AUTH_COOKIE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}