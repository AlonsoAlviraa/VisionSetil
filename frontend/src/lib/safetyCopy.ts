/**
 * Shared orientation-only product copy (Identify + surfaces).
 * Never consumption permission. Aligns with docs/SAFETY_POLICY.md / mycology-safety.
 */

/** Sticky strip under result (mobile-first). */
export const ORIENTATION_STICKY_ES =
  'Solo orientación de campo — nunca permiso de consumo. Valida con un experto.'

export const ORIENTATION_STICKY_EN =
  'Field orientation only — never permission to consume. Validate with an expert.'

/** Short chips under Identify hero. */
export const ORIENTATION_CHIPS_ES = [
  'Orientación, no consumo',
  'IA con abstención',
  'Preflight visible',
] as const

export const ORIENTATION_CHIPS_EN = [
  'Orientation, not consumption',
  'AI that can abstain',
  'Visible preflight',
] as const

/** ML dashboard lab metrics disclaimer. */
export const ML_LAB_METRICS_DISCLAIMER_ES =
  'Métricas de laboratorio (MAP@3, deadly@k) no desbloquean Identificar ni autorizan consumo. ' +
  'Solo diagnostican el stack de entrenamiento. Orientation only.'

export const ML_LAB_METRICS_DISCLAIMER_EN =
  'Lab metrics (MAP@3, deadly@k) do not unlock Identify or authorize consumption. ' +
  'They only diagnose the training stack. Orientation only.'

/** Encyclopedia food-class filters are educational taxonomy, not foraging OK. */
export const ENCYCLOPEDIA_FOOD_FILTER_NOTE_ES =
  'Filtros de ficha documental — no son permiso de consumo ni de recolección.'

export const ENCYCLOPEDIA_FOOD_FILTER_NOTE_EN =
  'Documentary sheet filters — not permission to consume or forage.'

function isEnglish(locale?: string): boolean {
  return (locale || '').toLowerCase().startsWith('en')
}

export function orientationStickyLine(locale?: string): string {
  return isEnglish(locale) ? ORIENTATION_STICKY_EN : ORIENTATION_STICKY_ES
}

export function orientationChips(locale?: string): readonly string[] {
  return isEnglish(locale) ? ORIENTATION_CHIPS_EN : ORIENTATION_CHIPS_ES
}

export function mlLabMetricsDisclaimer(locale?: string): string {
  return isEnglish(locale) ? ML_LAB_METRICS_DISCLAIMER_EN : ML_LAB_METRICS_DISCLAIMER_ES
}

export function encyclopediaFoodFilterNote(locale?: string): string {
  return isEnglish(locale)
    ? ENCYCLOPEDIA_FOOD_FILTER_NOTE_EN
    : ENCYCLOPEDIA_FOOD_FILTER_NOTE_ES
}
