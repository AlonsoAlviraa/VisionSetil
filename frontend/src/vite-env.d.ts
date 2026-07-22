/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_KEY?: string
  readonly VITE_MEDIA_PUBLIC_PREFIX?: string
  readonly VITE_FEATURE_SPECIES_MEDIA?: string
  readonly VITE_FEATURE_I18N?: string
  readonly VITE_FEATURE_UNIFIED_CATALOG?: string
  readonly VITE_FEATURE_GUIDED_IDENTIFY?: string
  readonly VITE_FEATURE_OFFLINE_PACK?: string
  readonly VITE_FEATURE_FAVORITES?: string
  readonly VITE_FEATURE_IDENTIFY_PREFLIGHT?: string
  /** D-B14: hard min views (gills+front). Default off (soft readiness). */
  readonly VITE_FEATURE_HARD_VIEW_MIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}