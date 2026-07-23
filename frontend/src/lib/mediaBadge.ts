/**
 * Phase D-05 — honest media badge labels (foto vs ilustración de marca).
 * Pure helpers for SpeciesImage / season pack chrome.
 */

export type MediaCascadeStage = 'primary' | 'card' | 'thumb' | 'placeholder' | 'inline' | string

/** True when the user is seeing branded/procedural art, not a real photo cascade hit. */
export function isIllustrationMedia(
  stage: MediaCascadeStage,
  mediaStatus?: string | null,
): boolean {
  const status = (mediaStatus || '').toLowerCase()
  if (
    status === 'ok_procedural' ||
    status === 'stub' ||
    status === 'placeholder_only' ||
    status === 'missing'
  ) {
    return true
  }
  return stage === 'placeholder' || stage === 'inline'
}

export function mediaBadgeLabel(
  stage: MediaCascadeStage,
  mediaStatus?: string | null,
): 'Ilustración' | 'Foto' {
  return isIllustrationMedia(stage, mediaStatus) ? 'Ilustración' : 'Foto'
}

/**
 * Whether to render the badge.
 * auto = only for illustrations; always = also "Foto"; false = never.
 */
export function shouldShowMediaBadge(
  mode: boolean | 'auto' | 'always',
  isIllustration: boolean,
  loaded: boolean,
): boolean {
  if (!mode) return false
  if (!loaded) return false
  if (mode === true || mode === 'auto') return isIllustration
  return mode === 'always'
}
