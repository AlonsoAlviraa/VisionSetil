/**
 * Guided multi-view capture model (iNaturalist / FungiCLEF style).
 * Pure logic — unit-tested without React.
 */

export const CANONICAL_VIEWS = ['gills', 'front', 'habitat', 'detail'] as const
export type CanonicalView = (typeof CANONICAL_VIEWS)[number]

export type ViewSlot = {
  view: CanonicalView
  labelEs: string
  hintEs: string
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

export type MultiViewReadiness = {
  canSubmit: boolean
  filled: number
  missingRequired: CanonicalView[]
  warnings: string[]
}

export function assessMultiViewReadiness(assignments: SlotAssignment): MultiViewReadiness {
  const missingRequired = VIEW_SLOTS.filter((s) => s.required && !assignments[s.view]).map(
    (s) => s.view,
  )
  const filled = orderedSlotKeys(assignments).length
  const warnings: string[] = []
  if (!assignments.habitat) {
    warnings.push('Falta vista de hábitat: mejora la evidencia ecológica (recomendado).')
  }
  if (!assignments.detail) {
    warnings.push('Falta detalle de pie/anillo/volva: reduce confusión con lookalikes.')
  }
  if (missingRequired.length > 0) {
    warnings.push(
      `Vistas críticas pendientes: ${missingRequired.join(', ')}. Puedes enviar con advertencia, pero el open-set puede rechazar.`,
    )
  }
  // Allow submit with ≥1 image (including partial wizard); flag readiness honestly.
  return {
    canSubmit: filled >= 1,
    filled,
    missingRequired,
    warnings,
  }
}

export function isCanonicalView(value: string): value is CanonicalView {
  return (CANONICAL_VIEWS as readonly string[]).includes(value)
}
