/**
 * Guided multi-view capture model (iNaturalist / FungiCLEF style).
 * Pure logic — unit-tested without React.
 *
 * D-B14 (B-25): default readiness is **soft** — submit with ≥1 filled view;
 * missing required (gills/front) are warnings. Hard gate (gills+front required
 * for canSubmit) only when `hardMinViews: true` (VITE_FEATURE_HARD_VIEW_MIN).
 */

export const CANONICAL_VIEWS = ['gills', 'front', 'habitat', 'detail'] as const
export type CanonicalView = (typeof CANONICAL_VIEWS)[number]

/** i18n key under `identify.views.*` / `identify.viewHint.*`. */
export type ViewSlot = {
  view: CanonicalView
  /** ES fallback when i18n is unavailable. */
  labelEs: string
  /** ES fallback hint when i18n is unavailable. */
  hintEs: string
  /** Critical for multi-view evidence (gills, front). */
  required: boolean
}

export const VIEW_SLOTS: ViewSlot[] = [
  {
    view: 'gills',
    labelEs: 'Láminas / himenio',
    hintEs: 'Parte inferior del sombrero (crítico)',
    required: true,
  },
  {
    view: 'front',
    labelEs: 'Frontal / perfil',
    hintEs: 'Sombrero y pie de lado',
    required: true,
  },
  {
    view: 'habitat',
    labelEs: 'Hábitat',
    hintEs: 'Entorno, sustrato y árboles cercanos',
    required: false,
  },
  {
    view: 'detail',
    labelEs: 'Detalle',
    hintEs: 'Anillo, volva, corte o textura',
    required: false,
  },
]

export type SlotFile = {
  fileName: string
  previewUrl: string
  /** Present at runtime when user selects a File; may be absent after JSON restore */
  file?: File
}

export type SlotAssignment = Partial<Record<CanonicalView, SlotFile>>

/** Ordered view_types array aligned with files for multipart classify. */
export function buildViewTypesOrder(
  assignments: SlotAssignment,
  orderedViews: readonly CanonicalView[] = CANONICAL_VIEWS,
): string[] {
  const types: string[] = []
  for (const v of orderedViews) {
    if (assignments[v]) types.push(v)
  }
  return types
}

/** Files in the same order as buildViewTypesOrder. */
export function orderedSlotKeys(assignments: SlotAssignment): CanonicalView[] {
  return CANONICAL_VIEWS.filter((v) => Boolean(assignments[v]))
}

/** Stable warning codes for i18n (`identify.readiness.*`). */
export type MultiViewWarningCode =
  | 'missing_habitat'
  | 'missing_detail'
  | 'missing_required'

export type MultiViewReadiness = {
  canSubmit: boolean
  filled: number
  missingRequired: CanonicalView[]
  /** Machine codes — prefer for UI i18n. */
  warningCodes: MultiViewWarningCode[]
  /**
   * Human-readable ES fallback strings (soft copy).
   * Prefer `warningCodes` + i18n in UI.
   */
  warnings: string[]
  /** Echo of options.hardMinViews for callers/tests. */
  hardMinViews: boolean
}

export type AssessMultiViewOptions = {
  /**
   * D-B14 hard gate: require all `required` slots (gills + front) filled.
   * Default **false** = soft (submit if ≥1 view; required gaps are warnings only).
   */
  hardMinViews?: boolean
}

const WARNING_ES: Record<MultiViewWarningCode, string> = {
  missing_habitat:
    'Falta vista de hábitat: mejora la evidencia ecológica (recomendado).',
  missing_detail:
    'Falta detalle de pie/anillo/volva: reduce confusión con lookalikes.',
  missing_required:
    'Vistas críticas pendientes. Puedes enviar con advertencia, pero el open-set puede rechazar.',
}

export function assessMultiViewReadiness(
  assignments: SlotAssignment,
  options: AssessMultiViewOptions = {},
): MultiViewReadiness {
  const hardMinViews = options.hardMinViews === true
  const missingRequired = VIEW_SLOTS.filter((s) => s.required && !assignments[s.view]).map(
    (s) => s.view,
  )
  const filled = orderedSlotKeys(assignments).length
  const warningCodes: MultiViewWarningCode[] = []

  if (!assignments.habitat) warningCodes.push('missing_habitat')
  if (!assignments.detail) warningCodes.push('missing_detail')
  if (missingRequired.length > 0) warningCodes.push('missing_required')

  const warnings = warningCodes.map((code) => {
    if (code === 'missing_required' && missingRequired.length > 0) {
      return `Vistas críticas pendientes: ${missingRequired.join(', ')}. Puedes enviar con advertencia, pero el open-set puede rechazar.`
    }
    return WARNING_ES[code]
  })

  // Soft (default): ≥1 image. Hard: ≥1 image AND all required slots filled.
  const canSubmit = hardMinViews
    ? filled >= 1 && missingRequired.length === 0
    : filled >= 1

  return {
    canSubmit,
    filled,
    missingRequired,
    warningCodes,
    warnings,
    hardMinViews,
  }
}

export function isCanonicalView(value: string): value is CanonicalView {
  return (CANONICAL_VIEWS as readonly string[]).includes(value)
}

/**
 * B-27: next wizard slot for a camera capture.
 * Priority: first missing **required** slot (gills → front), then first missing
 * optional (habitat → detail). Returns null when every slot is filled.
 */
export function nextCameraSlot(assignments: SlotAssignment): CanonicalView | null {
  for (const slot of VIEW_SLOTS) {
    if (slot.required && !assignments[slot.view]) return slot.view
  }
  for (const slot of VIEW_SLOTS) {
    if (!slot.required && !assignments[slot.view]) return slot.view
  }
  return null
}

/**
 * Resolve which slot receives a camera capture (B-27).
 *
 * - Prefer an explicit empty `preferred` only when it is required, or when no
 *   required slots are still missing (user picked an optional slot intentionally).
 * - Otherwise fall back to {@link nextCameraSlot} (missing required first).
 */
export function resolveCameraTargetSlot(
  assignments: SlotAssignment,
  preferred?: CanonicalView | null,
): CanonicalView | null {
  if (preferred && !assignments[preferred]) {
    const prefMeta = VIEW_SLOTS.find((s) => s.view === preferred)
    const missingRequired = VIEW_SLOTS.some((s) => s.required && !assignments[s.view])
    if (prefMeta?.required || !missingRequired) {
      return preferred
    }
  }
  return nextCameraSlot(assignments)
}
