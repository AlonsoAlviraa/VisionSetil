/**
 * Feature flags (PR-00 + Phase B).
 * Read from Vite env: VITE_FEATURE_* — defaults align with mega-plan + Phase B.
 */

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[key]
  if (raw === undefined || raw === '') return defaultValue
  const normalized = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

export const featureFlags = {
  /** SpeciesImage + own media store (PR-04) */
  SPECIES_MEDIA: envBool('VITE_FEATURE_SPECIES_MEDIA', true),
  /** react-i18next UI (PR-06) */
  I18N: envBool('VITE_FEATURE_I18N', true),
  /** Encyclopedia from catalog v2 (PR-08); false keeps legacy TS DB */
  UNIFIED_CATALOG: envBool('VITE_FEATURE_UNIFIED_CATALOG', true),
  /** 4-view guided Identify wizard (PR-10) */
  GUIDED_IDENTIFY: envBool('VITE_FEATURE_GUIDED_IDENTIFY', true),
  /** Offline pack precache (PR-19) */
  OFFLINE_PACK: envBool('VITE_FEATURE_OFFLINE_PACK', true),
  /** Favorites UI (PR-12) */
  FAVORITES: envBool('VITE_FEATURE_FAVORITES', true),
  /**
   * Identify PreflightBanner + offline submit disable (B-11).
   * Kill-switch hides banner; offline submit disable stays active when true (default).
   */
  IDENTIFY_PREFLIGHT: envBool('VITE_FEATURE_IDENTIFY_PREFLIGHT', true),
  /**
   * Hard minimum views gills+front before submit (B-25 / D-B14). Default OFF.
   */
  HARD_VIEW_MIN: envBool('VITE_FEATURE_HARD_VIEW_MIN', false),
  /**
   * Optional async classify + job polling (B-46). Default OFF.
   * Product path still uses envelope.simple only (same ResultModeBanner as sync).
   */
  ASYNC_CLASSIFY: envBool('VITE_FEATURE_ASYNC_CLASSIFY', false),
} as const

export type FeatureFlagKey = keyof typeof featureFlags

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return featureFlags[flag]
}
