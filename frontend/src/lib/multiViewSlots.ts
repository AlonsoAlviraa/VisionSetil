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

/** Relative diagnostic weights (match eval multiview_four_photo_benchmark). */
export const VIEW_WEIGHTS: Record<CanonicalView, number> = {
  gills: 0.38,
  front: 0.32,
  habitat: 0.15,
  detail: 0.15,
}

/** Soft submit ≥1; field ID quality improves sharply at 2 and 4 (E20 proxy bench). */
export const SOFT_SUBMIT_MIN_PHOTOS = 1
export const RECOMMENDED_MIN_FOR_FIELD_ID = 2
export const FULL_PACKET_PHOTOS = 4

/**
 * Orientation copy when user has fewer than recommended photos.
 * Sourced from E20 proxy bench: MAP@3 1→4 ≈ +0.28; reject 1.0→0.18.
 */
export function multiViewQualityHint(filled: number, locale?: string): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  if (filled >= FULL_PACKET_PHOTOS) {
    return en
      ? 'Full 4-photo packet — best orientation signal (still never edible clearance).'
      : 'Paquete completo de 4 fotos — mejor señal orientativa (nunca permiso de consumo).'
  }
  if (filled >= RECOMMENDED_MIN_FOR_FIELD_ID) {
    return en
      ? 'Good start (inferior+profile). Add habitat + detail to cut lookalike risk.'
      : 'Buen comienzo (inferior+perfil). Añade hábitat + detalle para bajar confusiones.'
  }
  if (filled >= SOFT_SUBMIT_MIN_PHOTOS) {
    return en
      ? 'One photo is weak: model abstains more often. Prefer underside + full profile.'
      : 'Una sola foto es débil: el modelo se abstiene más. Mejor inferior + perfil completo.'
  }
  return en ? 'Add at least one photo to identify.' : 'Añade al menos una foto para identificar.'
}


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

/**
 * Multi-angle capture (Picture Mushroom / field-guide style):
 * underside + profile first (diagnostic), then habitat + detail.
 * Better photos reduce false confidence — never edible clearance.
 */
export const VIEW_SLOTS: ViewSlot[] = [
  {
    view: 'gills',
    labelEs: 'Inferior (láminas)',
    hintEs: 'Debajo del sombrero: láminas, poros o pliegues (lo más diagnóstico)',
    required: true,
  },
  {
    view: 'front',
    labelEs: 'Perfil completo',
    hintEs: 'De lado: sombrero + pie + base (anillo/volva si hay)',
    required: true,
  },
  {
    view: 'habitat',
    labelEs: 'Hábitat',
    hintEs: 'Dónde crece: suelo, madera, árboles o pradera cercana',
    required: false,
  },
  {
    view: 'detail',
    labelEs: 'Detalle diagnóstico',
    hintEs: 'Cerca: volva, anillo, textura del pie o corte (sin probar)',
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

  const baseWarnings = warningCodes.map((code) => {
    if (code === 'missing_required' && missingRequired.length > 0) {
      return `Vistas críticas pendientes: ${missingRequired.join(', ')}. Puedes enviar con advertencia, pero el open-set puede rechazar.`
    }
    return WARNING_ES[code]
  })

  // Soft (default): ≥1 image. Hard: ≥1 image AND all required slots filled.
  const canSubmit = hardMinViews
    ? filled >= 1 && missingRequired.length === 0
    : filled >= 1

  // Bench-informed quality nudge (not a hard gate)
  const warnings =
    filled >= 1 && filled < FULL_PACKET_PHOTOS
      ? [...baseWarnings, multiViewQualityHint(filled, 'es')]
      : baseWarnings

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
 * Progressive coach for soft multi-view (beta / competitive residual).
 * Never hard-blocks submit; steers underside → profile first.
 */
export type ProgressiveCoach = {
  /** 0 = empty, 1 = single weak, 2 = required pair, 3–4 = optional depth */
  stage: 0 | 1 | 2 | 3 | 4
  requiredDone: number
  requiredTotal: number
  filled: number
  nextView: CanonicalView | null
  /** i18n-ready code for UI */
  code:
    | 'empty'
    | 'single_need_critical'
    | 'pair_add_optional'
    | 'almost_full'
    | 'full'
  headlineEs: string
  headlineEn: string
  softSubmitAllowed: boolean
}

export function progressiveMultiViewCoach(
  assignments: SlotAssignment,
  options: AssessMultiViewOptions = {},
): ProgressiveCoach {
  const readiness = assessMultiViewReadiness(assignments, options)
  const requiredTotal = VIEW_SLOTS.filter((s) => s.required).length
  const requiredDone = requiredTotal - readiness.missingRequired.length
  const nextView = nextCameraSlot(assignments)
  const filled = readiness.filled

  let stage: ProgressiveCoach['stage'] = 0
  let code: ProgressiveCoach['code'] = 'empty'
  let headlineEs = 'Empieza por debajo del sombrero (láminas/poros) — es lo más diagnóstico.'
  let headlineEn = 'Start with the underside (gills/pores) — most diagnostic.'

  if (filled === 0) {
    stage = 0
    code = 'empty'
  } else if (requiredDone < requiredTotal) {
    stage = 1
    code = 'single_need_critical'
    const nextLabel =
      nextView === 'gills'
        ? { es: 'inferior (láminas/poros)', en: 'underside (gills/pores)' }
        : nextView === 'front'
          ? { es: 'perfil completo (sombrero+pie)', en: 'full profile (cap+stem)' }
          : { es: 'vista crítica pendiente', en: 'missing critical view' }
    headlineEs = `Paso ${requiredDone + 1}/${requiredTotal} crítico: añade ${nextLabel.es}. Puedes enviar ya (soft), pero el modelo se abstiene más con 1 sola foto.`
    headlineEn = `Critical step ${requiredDone + 1}/${requiredTotal}: add ${nextLabel.en}. Soft submit allowed, but one photo abstains more often.`
  } else if (filled < FULL_PACKET_PHOTOS - 1) {
    stage = 2
    code = 'pair_add_optional'
    headlineEs =
      'Inferior + perfil listos. Añade hábitat o detalle (volva/anillo) para bajar confusiones de lookalikes.'
    headlineEn =
      'Underside + profile ready. Add habitat or detail (volva/ring) to reduce lookalike confusion.'
  } else if (filled < FULL_PACKET_PHOTOS) {
    stage = 3
    code = 'almost_full'
    headlineEs = 'Casi el paquete de 4: una vista más mejora la orientación (nunca permiso de consumo).'
    headlineEn = 'Almost a full 4-pack: one more view improves orientation (never edible clearance).'
  } else {
    stage = 4
    code = 'full'
    headlineEs = 'Paquete multi-vista completo — mejor señal orientativa. Sigue sin autorizar consumo.'
    headlineEn = 'Full multi-view packet — best orientation signal. Still never consumption permission.'
  }

  return {
    stage,
    requiredDone,
    requiredTotal,
    filled,
    nextView,
    code,
    headlineEs,
    headlineEn,
    softSubmitAllowed: readiness.canSubmit,
  }
}

/**
 * Pre-submit soft coach (v1.7 graph eng).
 * Soft path only: never hard-blocks canSubmit; returns needsSoftConfirm
 * when packet is weak (1 photo) or missing critical underside/profile.
 * Policy: orientation only — never consumption permission.
 */
export type PreSubmitCoach = {
  /** True when UI should show confirm before POST */
  needsSoftConfirm: boolean
  severity: 'ok' | 'weak_single' | 'missing_critical'
  code: 'ready' | 'single_photo' | 'missing_critical' | 'empty'
  nextView: CanonicalView | null
  requiredDone: number
  requiredTotal: number
  filled: number
  confirmTitleEs: string
  confirmTitleEn: string
  confirmBodyEs: string
  confirmBodyEn: string
  /** Primary CTA: add next diagnostic view */
  addViewCtaEs: string
  addViewCtaEn: string
  /** Secondary: proceed soft (orientation only) */
  proceedCtaEs: string
  proceedCtaEn: string
}

export function preSubmitMultiViewCoach(
  assignments: SlotAssignment,
  options: AssessMultiViewOptions = {},
): PreSubmitCoach {
  const readiness = assessMultiViewReadiness(assignments, options)
  const progressive = progressiveMultiViewCoach(assignments, options)
  const requiredTotal = progressive.requiredTotal
  const requiredDone = progressive.requiredDone
  const filled = readiness.filled
  const nextView = progressive.nextView

  if (filled === 0) {
    return {
      needsSoftConfirm: false,
      severity: 'ok',
      code: 'empty',
      nextView,
      requiredDone,
      requiredTotal,
      filled,
      confirmTitleEs: 'Añade al menos una foto',
      confirmTitleEn: 'Add at least one photo',
      confirmBodyEs: 'Sin fotos no hay identificación orientativa.',
      confirmBodyEn: 'Without photos there is no orientation ID.',
      addViewCtaEs: 'Añadir láminas',
      addViewCtaEn: 'Add underside',
      proceedCtaEs: '—',
      proceedCtaEn: '—',
    }
  }

  if (requiredDone < requiredTotal) {
    const missing =
      readiness.missingRequired.length > 0
        ? readiness.missingRequired.join(' + ')
        : 'gills/front'
    return {
      needsSoftConfirm: true,
      severity: 'missing_critical',
      code: 'missing_critical',
      nextView,
      requiredDone,
      requiredTotal,
      filled,
      confirmTitleEs: 'Faltan vistas críticas',
      confirmTitleEn: 'Critical views missing',
      confirmBodyEs: `Quedan críticas (${missing}). Con paquete incompleto el modelo se abstiene más. Solo orientación — nunca permiso de consumo.`,
      confirmBodyEn: `Critical views still open (${missing}). Incomplete packets abstain more often. Orientation only — never consumption permission.`,
      addViewCtaEs:
        nextView === 'gills'
          ? 'Añadir láminas (inferior)'
          : nextView === 'front'
            ? 'Añadir perfil completo'
            : 'Añadir vista crítica',
      addViewCtaEn:
        nextView === 'gills'
          ? 'Add underside (gills)'
          : nextView === 'front'
            ? 'Add full profile'
            : 'Add critical view',
      proceedCtaEs: 'Enviar igual (soft · solo orientación)',
      proceedCtaEn: 'Submit anyway (soft · orientation only)',
    }
  }

  if (filled < RECOMMENDED_MIN_FOR_FIELD_ID) {
    return {
      needsSoftConfirm: true,
      severity: 'weak_single',
      code: 'single_photo',
      nextView,
      requiredDone,
      requiredTotal,
      filled,
      confirmTitleEs: 'Una sola foto es débil',
      confirmTitleEn: 'A single photo is weak',
      confirmBodyEs:
        'Con 1 foto el open-set rechaza más a menudo. Mejor inferior + perfil. Solo orientación — nunca consumo.',
      confirmBodyEn:
        'With 1 photo open-set rejects more often. Prefer underside + profile. Orientation only — never consumption.',
      addViewCtaEs: 'Añadir otra vista',
      addViewCtaEn: 'Add another view',
      proceedCtaEs: 'Enviar con 1 foto (soft · orientación)',
      proceedCtaEn: 'Submit with 1 photo (soft · orientation)',
    }
  }

  return {
    needsSoftConfirm: false,
    severity: 'ok',
    code: 'ready',
    nextView,
    requiredDone,
    requiredTotal,
    filled,
    confirmTitleEs: 'Paquete listo para orientación',
    confirmTitleEn: 'Packet ready for orientation',
    confirmBodyEs: 'Inferior + perfil presentes. Sigue sin autorizar consumo.',
    confirmBodyEn: 'Underside + profile present. Still never consumption permission.',
    addViewCtaEs: 'Añadir opcional',
    addViewCtaEn: 'Add optional',
    proceedCtaEs: 'Analizar',
    proceedCtaEn: 'Analyze',
  }
}

/**
 * Educational free-mode view_types heuristic (v1.8.2).
 * Assigns first photos to critical slots in order gills → front → habitat → detail.
 * Never invents labels beyond n photos; orientation only.
 */
export function freeModeViewTypesHeuristic(photoCount: number): CanonicalView[] {
  const n = Math.max(0, Math.min(Math.floor(photoCount), CANONICAL_VIEWS.length))
  return CANONICAL_VIEWS.slice(0, n)
}

/** Capture / result packet density (orientation only — never edible clearance). */
export type CapturePacketDensityLevel = 'empty' | 'weak' | 'ok' | 'full'

export type CapturePacketDensity = {
  photoCount: number
  views: CanonicalView[]
  criticalDone: number
  criticalTotal: 2
  density: CapturePacketDensityLevel
  missingCritical: CanonicalView[]
}

/**
 * Summarize multi-view packet density from sent/heuristic view labels.
 * Critical = gills + front. Density: 0 empty · 1 weak · 2–3 ok · 4+ full.
 */
export function capturePacketDensity(
  viewTypes: readonly string[] | null | undefined,
  photoCountFallback = 0,
): CapturePacketDensity {
  const views = (viewTypes || [])
    .map((v) => String(v || '').toLowerCase().trim())
    .filter(isCanonicalView)
  // de-dupe preserving order
  const seen = new Set<CanonicalView>()
  const unique: CanonicalView[] = []
  for (const v of views) {
    if (seen.has(v)) continue
    seen.add(v)
    unique.push(v)
  }
  const photoCount = Math.max(unique.length, Math.max(0, Math.floor(photoCountFallback)))
  const hasGills = unique.includes('gills')
  const hasFront = unique.includes('front')
  const criticalDone = (hasGills ? 1 : 0) + (hasFront ? 1 : 0)
  const missingCritical: CanonicalView[] = []
  if (!hasGills) missingCritical.push('gills')
  if (!hasFront) missingCritical.push('front')

  let density: CapturePacketDensityLevel = 'empty'
  if (photoCount <= 0) density = 'empty'
  else if (photoCount < RECOMMENDED_MIN_FOR_FIELD_ID) density = 'weak'
  else if (photoCount >= FULL_PACKET_PHOTOS) density = 'full'
  else density = 'ok'

  return {
    photoCount,
    views: unique,
    criticalDone,
    criticalTotal: 2,
    density,
    missingCritical,
  }
}

const VIEW_LABEL_ES: Record<CanonicalView, string> = {
  gills: 'láminas',
  front: 'perfil',
  habitat: 'hábitat',
  detail: 'detalle',
}
const VIEW_LABEL_EN: Record<CanonicalView, string> = {
  gills: 'gills',
  front: 'profile',
  habitat: 'habitat',
  detail: 'detail',
}

/** Short comma list of views for chips / density strips. */
export function formatViewTypesShort(
  viewTypes: readonly string[] | null | undefined,
  locale?: string,
): string {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  const map = en ? VIEW_LABEL_EN : VIEW_LABEL_ES
  const dens = capturePacketDensity(viewTypes)
  if (dens.views.length === 0) return ''
  return dens.views.map((v) => map[v]).join(' · ')
}

/**
 * Free-mode capture coach line (P14): educational heuristic labels + density.
 * Never claims species ID or consumption clearance.
 */
export function freeModeCaptureCoachLine(
  photoCount: number,
  _locale?: string,
): { density: CapturePacketDensity; lineEs: string; lineEn: string } {
  const views = freeModeViewTypesHeuristic(photoCount)
  const density = capturePacketDensity(views, photoCount)
  const shortEs = formatViewTypesShort(views, 'es')
  const shortEn = formatViewTypesShort(views, 'en')
  if (density.density === 'empty') {
    return {
      density,
      lineEs: 'Añade fotos: prioriza láminas + perfil (modo libre · solo orientación).',
      lineEn: 'Add photos: prefer underside + profile (free mode · orientation only).',
    }
  }
  if (density.density === 'weak') {
    return {
      density,
      lineEs: `1 foto · etiqueta educativa «${shortEs || 'láminas'}». Paquete débil — añade perfil. Nunca consumo.`,
      lineEn: `1 photo · educational label “${shortEn || 'gills'}”. Weak packet — add profile. Never consumption.`,
    }
  }
  if (density.density === 'full') {
    return {
      density,
      lineEs: `Paquete 4 · ${shortEs}. Mejor señal orientativa — sigue sin permiso de consumo.`,
      lineEn: `4-view packet · ${shortEn}. Best orientation signal — still never consumption permission.`,
    }
  }
  return {
    density,
    lineEs: `${density.photoCount} fotos · ${shortEs}. Añade hábitat/detalle si puedes — solo orientación.`,
    lineEn: `${density.photoCount} photos · ${shortEn}. Add habitat/detail if you can — orientation only.`,
  }
}

/**
 * Free-mode (unguided multi-file) soft coach — parity with wizard soft path.
 * Never hard-blocks; nudges multi-photo when n < 2.
 */
export function preSubmitFreeModeCoach(photoCount: number): PreSubmitCoach {
  const n = Math.max(0, Math.floor(photoCount))
  if (n === 0) {
    return {
      needsSoftConfirm: false,
      severity: 'ok',
      code: 'empty',
      nextView: 'gills',
      requiredDone: 0,
      requiredTotal: 2,
      filled: 0,
      confirmTitleEs: 'Añade al menos una foto',
      confirmTitleEn: 'Add at least one photo',
      confirmBodyEs: 'Sin fotos no hay identificación orientativa.',
      confirmBodyEn: 'Without photos there is no orientation ID.',
      addViewCtaEs: 'Añadir foto',
      addViewCtaEn: 'Add photo',
      proceedCtaEs: '—',
      proceedCtaEn: '—',
    }
  }
  if (n < RECOMMENDED_MIN_FOR_FIELD_ID) {
    return {
      needsSoftConfirm: true,
      severity: 'weak_single',
      code: 'single_photo',
      nextView: 'front',
      requiredDone: 0,
      requiredTotal: 2,
      filled: n,
      confirmTitleEs: 'Modo libre: 1 foto es débil',
      confirmTitleEn: 'Free mode: 1 photo is weak',
      confirmBodyEs:
        'En modo libre, prioriza inferior + perfil (2+ fotos). Open-set se abstiene más con 1 sola. Solo orientación — nunca consumo. Mejor usa el modo guiado.',
      confirmBodyEn:
        'In free mode, prefer underside + profile (2+ photos). Open-set abstains more with one shot. Orientation only — never consumption. Prefer guided mode.',
      addViewCtaEs: 'Añadir otra foto',
      addViewCtaEn: 'Add another photo',
      proceedCtaEs: 'Enviar con 1 foto (soft · orientación)',
      proceedCtaEn: 'Submit with 1 photo (soft · orientation)',
    }
  }
  return {
    needsSoftConfirm: false,
    severity: 'ok',
    code: 'ready',
    nextView: null,
    requiredDone: 2,
    requiredTotal: 2,
    filled: n,
    confirmTitleEs: 'Paquete libre listo (orientación)',
    confirmTitleEn: 'Free packet ready (orientation)',
    confirmBodyEs: 'Varias fotos ayudan. Sigue sin autorizar consumo.',
    confirmBodyEn: 'Several photos help. Still never consumption permission.',
    addViewCtaEs: 'Añadir más',
    addViewCtaEn: 'Add more',
    proceedCtaEs: 'Analizar',
    proceedCtaEn: 'Analyze',
  }
}

/** Short framing coach per empty slot (visual guide, not species ID). */
export function framingGuideForView(
  view: CanonicalView,
  locale?: string,
): { title: string; body: string } {
  const en = (locale || 'es').toLowerCase().startsWith('en')
  switch (view) {
    case 'gills':
      return en
        ? {
            title: 'Frame underside',
            body: 'Tilt so gills/pores fill the center. Avoid fingers over the hymenium.',
          }
        : {
            title: 'Encuadra el inferior',
            body: 'Inclina para que láminas/poros llenen el centro. Evita dedos sobre el himenio.',
          }
    case 'front':
      return en
        ? {
            title: 'Full profile',
            body: 'Cap + stem + base in frame. Leave space under the base for volva/ring.',
          }
        : {
            title: 'Perfil completo',
            body: 'Sombrero + pie + base en cuadro. Deja aire bajo la base (volva/anillo).',
          }
    case 'habitat':
      return en
        ? {
            title: 'Context frame',
            body: 'Step back: soil, wood, or host tree visible — not a tight crop only.',
          }
        : {
            title: 'Encuadre de contexto',
            body: 'Aléjate: suelo, madera o árbol huésped visibles — no solo un recorte.',
          }
    case 'detail':
      return en
        ? {
            title: 'Diagnostic close-up',
            body: 'Ring, volva, stem texture, or clean cut surface. Never taste.',
          }
        : {
            title: 'Detalle diagnóstico',
            body: 'Anillo, volva, textura del pie o corte limpio. Nunca probar.',
          }
    default:
      return en
        ? { title: 'Frame the subject', body: 'Fill the frame with the mushroom.' }
        : { title: 'Encuadra el sujeto', body: 'Llena el cuadro con la seta.' }
  }
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
