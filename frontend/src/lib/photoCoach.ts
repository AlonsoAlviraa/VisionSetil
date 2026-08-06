/**
 * PhotoCoach — multi-view learning helpers (UX-03).
 *
 * Pure, table-testable quality hints + slot checklists.
 * Educates better diagnostic captures — never consumption permission.
 * Fail-open: never blocks submit.
 */

import type { CanonicalView } from './multiViewSlots'
import { CANONICAL_VIEWS } from './multiViewSlots'
import examplesJson from '../data/photoCoachExamples.json'

/** Byte size below this → likely too compressed / tiny for diagnosis. */
export const FILE_TINY_BYTES = 40_000
/** Min edge (px) when dimensions known. */
export const EDGE_SMALL_PX = 400
/** max(edge)/min(edge) above this → extreme aspect (crop / panorama). */
export const ASPECT_EXTREME_RATIO = 3
/** Mean luminance 0–255: below → too dark. */
export const LUMA_DARK_MAX = 45
/** Mean luminance 0–255: above → too bright / blown. */
export const LUMA_BRIGHT_MIN = 210

export type CoachHintCode =
  | 'file_tiny'
  | 'edge_small'
  | 'aspect_extreme'
  | 'luma_dark'
  | 'luma_bright'

export type CoachHintSeverity = 'info' | 'warn'

export type CoachHint = {
  code: CoachHintCode
  severity: CoachHintSeverity
  /** i18n key under identify.coach.hint.* */
  messageKey: string
}

export type PhotoClientHintInput = {
  byteLength: number
  width?: number
  height?: number
  /**
   * Mean luminance 0–255 from optional canvas sample.
   * Only assessed when `options.luminance === true` (feature-flag gated by caller).
   */
  lumaMean?: number
  /**
   * Optional luminance variance (reserved / progressive). Not required for dark/bright.
   */
  lumaVariance?: number
}

export type AssessPhotoClientHintsOptions = {
  /**
   * When true, evaluate luma_dark / luma_bright if lumaMean is provided.
   * Default false — matches PHOTO_COACH_LUMINANCE default off.
   */
  luminance?: boolean
}

const HINT_MESSAGE_KEY: Record<CoachHintCode, string> = {
  file_tiny: 'identify.coach.hint.file_tiny',
  edge_small: 'identify.coach.hint.edge_small',
  aspect_extreme: 'identify.coach.hint.aspect_extreme',
  luma_dark: 'identify.coach.hint.luma_dark',
  luma_bright: 'identify.coach.hint.luma_bright',
}

/**
 * Pure client-side photo quality hints. Fail-open: incomplete input → fewer hints.
 * Never blocks classify submit.
 */
export function assessPhotoClientHints(
  input: PhotoClientHintInput,
  options: AssessPhotoClientHintsOptions = {},
): CoachHint[] {
  const hints: CoachHint[] = []
  const byteLength = Number.isFinite(input.byteLength) ? Math.max(0, input.byteLength) : 0

  if (byteLength > 0 && byteLength < FILE_TINY_BYTES) {
    hints.push({
      code: 'file_tiny',
      severity: 'warn',
      messageKey: HINT_MESSAGE_KEY.file_tiny,
    })
  }

  const w = input.width
  const h = input.height
  const hasDims =
    typeof w === 'number' &&
    typeof h === 'number' &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w > 0 &&
    h > 0

  if (hasDims) {
    const minEdge = Math.min(w!, h!)
    const maxEdge = Math.max(w!, h!)
    if (minEdge < EDGE_SMALL_PX) {
      hints.push({
        code: 'edge_small',
        severity: 'warn',
        messageKey: HINT_MESSAGE_KEY.edge_small,
      })
    }
    if (minEdge > 0 && maxEdge / minEdge > ASPECT_EXTREME_RATIO) {
      hints.push({
        code: 'aspect_extreme',
        severity: 'info',
        messageKey: HINT_MESSAGE_KEY.aspect_extreme,
      })
    }
  }

  if (options.luminance === true && typeof input.lumaMean === 'number' && Number.isFinite(input.lumaMean)) {
    const mean = input.lumaMean
    if (mean < LUMA_DARK_MAX) {
      hints.push({
        code: 'luma_dark',
        severity: 'warn',
        messageKey: HINT_MESSAGE_KEY.luma_dark,
      })
    } else if (mean > LUMA_BRIGHT_MIN) {
      hints.push({
        code: 'luma_bright',
        severity: 'info',
        messageKey: HINT_MESSAGE_KEY.luma_bright,
      })
    }
  }

  return hints
}

/** Static checklist item ids per canonical view (i18n: identify.coach.checklist.<view>.<id>). */
export type CoachChecklistItem = {
  id: string
  /** ES fallback when i18n unavailable. */
  labelEs: string
  labelEn: string
}

export const SLOT_CHECKLISTS: Record<CanonicalView, CoachChecklistItem[]> = {
  gills: [
    {
      id: 'hymenium_visible',
      labelEs: '¿Se ven láminas, poros o pliegues del himenio?',
      labelEn: 'Are gills, pores, or folds of the hymenium visible?',
    },
    {
      id: 'in_focus',
      labelEs: '¿Enfoque en el himenio (no en el fondo)?',
      labelEn: 'Is focus on the hymenium (not the background)?',
    },
    {
      id: 'not_top_only',
      labelEs: '¿El sombrero no tapa todo el inferior?',
      labelEn: 'Is the underside not fully hidden by the cap?',
    },
  ],
  front: [
    {
      id: 'full_profile',
      labelEs: '¿Sombrero + pie + base en el cuadro?',
      labelEn: 'Cap + stem + base all in frame?',
    },
    {
      id: 'ring_volva',
      labelEs: '¿Anillo/volva visibles si existen?',
      labelEn: 'Ring/volva visible when present?',
    },
    {
      id: 'side_angle',
      labelEs: '¿Ángulo de perfil (no solo desde arriba)?',
      labelEn: 'Side profile angle (not only top-down)?',
    },
  ],
  habitat: [
    {
      id: 'substrate',
      labelEs: '¿Suelo, madera o árbol de contexto visibles?',
      labelEn: 'Soil, wood, or host tree context visible?',
    },
    {
      id: 'no_tight_crop',
      labelEs: '¿Sin recortar todo el sustrato?',
      labelEn: 'Substrate not fully cropped out?',
    },
    {
      id: 'context_scale',
      labelEs: '¿Se entiende dónde crece (paso atrás)?',
      labelEn: 'Is the growth context clear (step back)?',
    },
  ],
  detail: [
    {
      id: 'macro_diag',
      labelEs: '¿Macro de volva, anillo o textura del pie?',
      labelEn: 'Macro of volva, ring, or stem texture?',
    },
    {
      id: 'clean_cut',
      labelEs: '¿Corte limpio si lo hay (sin probar)?',
      labelEn: 'Clean cut surface if any (never taste)?',
    },
    {
      id: 'never_taste',
      labelEs: 'Nunca morder ni lamer para “probar”.',
      labelEn: 'Never bite or lick to “taste”.',
    },
  ],
}

export function checklistForView(view: CanonicalView): CoachChecklistItem[] {
  return SLOT_CHECKLISTS[view] ?? []
}

export type CoachExampleQuality = 'good' | 'bad'

export type CoachExample = {
  id: string
  view: CanonicalView
  quality: CoachExampleQuality
  labelEs: string
  labelEn: string
  /** CSS wireframe class suffix (photo-coach-frame--*). */
  cssFrame: string
  /** Optional progressive webp path; panel must work if missing. */
  thumb?: string
}

export type PhotoCoachExamplesFile = {
  version: number
  policy: string
  views: Record<
    string,
    {
      examples: Array<{
        id: string
        quality: CoachExampleQuality
        labelEs: string
        labelEn: string
        cssFrame: string
        thumb?: string
      }>
    }
  >
}

const EXAMPLES_DATA = examplesJson as PhotoCoachExamplesFile

/** Good/bad educational examples for a view (JSON + CSS; webp optional). */
export function examplesForView(view: CanonicalView): CoachExample[] {
  const block = EXAMPLES_DATA.views?.[view]
  if (!block?.examples?.length) return []
  return block.examples.map((ex) => ({
    id: ex.id,
    view,
    quality: ex.quality,
    labelEs: ex.labelEs,
    labelEn: ex.labelEn,
    cssFrame: ex.cssFrame,
    thumb: ex.thumb,
  }))
}

export function allCoachViews(): readonly CanonicalView[] {
  return CANONICAL_VIEWS
}

/** Optional local skill counter (learning-first; no network analytics). */
export const PHOTO_COACH_SKILL_KEY = 'visionsetil_photo_coach_skill_v1'

type StorageLike = {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export type PhotoCoachSkill = {
  /** Times the user opened / expanded the coach panel. */
  opens: number
  lastDay: string
}

function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function readPhotoCoachSkill(storage?: StorageLike | null): PhotoCoachSkill {
  const empty: PhotoCoachSkill = { opens: 0, lastDay: '' }
  if (!storage) return empty
  try {
    const raw = storage.getItem(PHOTO_COACH_SKILL_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<PhotoCoachSkill>
    return {
      opens: typeof parsed.opens === 'number' && parsed.opens >= 0 ? Math.floor(parsed.opens) : 0,
      lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : '',
    }
  } catch {
    return empty
  }
}

/** Increment local open counter when user expands the panel (privacy-first). */
export function recordPhotoCoachOpen(storage?: StorageLike | null): PhotoCoachSkill {
  if (!storage) return { opens: 0, lastDay: '' }
  const prev = readPhotoCoachSkill(storage)
  const next: PhotoCoachSkill = {
    opens: prev.opens + 1,
    lastDay: dayKey(),
  }
  try {
    storage.setItem(PHOTO_COACH_SKILL_KEY, JSON.stringify(next))
  } catch {
    // fail-open: quota / private mode
  }
  return next
}

/** Progressive probe result for client hints (not required for submit). */
export type ProbedPhotoMeta = {
  width?: number
  height?: number
  lumaMean?: number
}

const LUMA_SAMPLE_MAX = 64

/**
 * Progressive image probe: natural width/height and optional mean luminance.
 * Fail-open: returns {} on any error / missing DOM Image / decode failure.
 * Never throws; never blocks classify.
 */
export async function probePhotoClientMeta(
  source: string | Blob | null | undefined,
  options: { luminance?: boolean } = {},
): Promise<ProbedPhotoMeta> {
  if (source == null || source === '') return {}
  if (typeof Image === 'undefined') return {}

  let objectUrl: string | null = null
  try {
    const src =
      typeof source === 'string'
        ? source
        : ((objectUrl = URL.createObjectURL(source)), objectUrl)

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image_decode_failed'))
      el.src = src
    })

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    const out: ProbedPhotoMeta = {}
    if (width > 0 && height > 0) {
      out.width = width
      out.height = height
    }

    if (options.luminance === true && typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas')
        const sw = Math.min(LUMA_SAMPLE_MAX, width || LUMA_SAMPLE_MAX)
        const sh = Math.min(LUMA_SAMPLE_MAX, height || LUMA_SAMPLE_MAX)
        if (sw > 0 && sh > 0) {
          canvas.width = sw
          canvas.height = sh
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(img, 0, 0, sw, sh)
            const data = ctx.getImageData(0, 0, sw, sh).data
            let sum = 0
            const n = sw * sh
            for (let i = 0; i < data.length; i += 4) {
              // Rec. 601 luma
              sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            }
            if (n > 0) out.lumaMean = sum / n
          }
        }
      } catch {
        // fail-open: dims still useful without luma
      }
    }

    return out
  } catch {
    return {}
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        /* ignore */
      }
    }
  }
}
