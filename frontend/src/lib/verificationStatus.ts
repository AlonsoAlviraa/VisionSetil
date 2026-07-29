/**
 * iNat-inspired honest verification status for Identify results.
 *
 * Orientation only:
 * - Never labels a model output as research-grade / food-safe.
 * - Maps open-set, missing evidence, and expert handoff into clear next steps.
 * - Second opinion = community + expert + lookalike studio (not edible clearance).
 */
import type { ClassificationResult } from '../api/types'

export type VerificationStatusId =
  | 'abstained'
  | 'needs_more_evidence'
  | 'needs_expert'
  | 'provisional_model_cue'

export type VerificationStatus = {
  id: VerificationStatusId
  /** iNat-flavoured short label (never "research-grade" from model alone). */
  titleEs: string
  titleEn: string
  bodyEs: string
  bodyEn: string
  /** Always false — model scores never mint research-grade. */
  isResearchGrade: false
}

const STATUSES: Record<VerificationStatusId, Omit<VerificationStatus, 'id' | 'isResearchGrade'>> = {
  abstained: {
    titleEs: 'Sin ID fiable (open-set)',
    titleEn: 'No reliable ID (open-set)',
    bodyEs:
      'El modelo se abstuvo. Añade multi-vista, compara lookalikes o pide segunda opinión humana. Nunca es permiso de consumo.',
    bodyEn:
      'The model abstained. Add multi-view photos, compare lookalikes, or ask a human second opinion. Never consumption permission.',
  },
  needs_more_evidence: {
    titleEs: 'Falta evidencia (Needs ID)',
    titleEn: 'Needs more evidence (Needs ID)',
    bodyEs:
      'Faltan fotos o pistas de campo. Completa inferior + perfil (y hábitat/detalle si puedes). Orientación, no certificación.',
    bodyEn:
      'Photos or field cues are missing. Complete underside + profile (and habitat/detail if you can). Orientation only — not certification.',
  },
  needs_expert: {
    titleEs: 'Revisión humana recomendada',
    titleEn: 'Human review recommended',
    bodyEs:
      'Hay incertidumbre o confusiones de riesgo. Consulta comunidad o micólogo — la app no otorga research-grade ni consumo.',
    bodyEn:
      'Uncertainty or risky lookalikes. Ask the community or a mycologist — the app never grants research-grade or edible clearance.',
  },
  provisional_model_cue: {
    titleEs: 'Pista de modelo (provisional)',
    titleEn: 'Provisional model cue',
    bodyEs:
      'Solo orientación automática. No es research-grade de iNat: verifica con multi-foto, lookalikes y, si dudas, un humano.',
    bodyEn:
      'Automatic orientation only. Not iNat research-grade: verify with multi-view, lookalikes, and a human if unsure.',
  },
}

/**
 * Resolve honest verification UI state from a classification result.
 * Priority: abstain → missing evidence → expert → provisional cue.
 */
export function resolveVerificationStatus(
  result: Pick<
    ClassificationResult,
    | 'decision'
    | 'missing_evidence'
    | 'recommend_human_review'
    | 'dangerous_lookalikes'
    | 'open_set_reason'
    | 'warnings'
  >,
): VerificationStatus {
  const rejected = result.decision === 'rejected'
  const openSet =
    Boolean(result.open_set_reason && String(result.open_set_reason).trim()) ||
    (result.warnings || []).some((w) => /open.?set|out.of.distribution|unknown/i.test(w))

  if (rejected || openSet) {
    return { id: 'abstained', isResearchGrade: false, ...STATUSES.abstained }
  }

  if ((result.missing_evidence || []).length > 0) {
    return {
      id: 'needs_more_evidence',
      isResearchGrade: false,
      ...STATUSES.needs_more_evidence,
    }
  }

  const deadlyLookalikes = (result.dangerous_lookalikes || []).length > 0
  if (result.recommend_human_review || deadlyLookalikes) {
    return { id: 'needs_expert', isResearchGrade: false, ...STATUSES.needs_expert }
  }

  return {
    id: 'provisional_model_cue',
    isResearchGrade: false,
    ...STATUSES.provisional_model_cue,
  }
}

export function verificationTitle(status: VerificationStatus, locale = 'es'): string {
  return locale.toLowerCase().startsWith('en') ? status.titleEn : status.titleEs
}

export function verificationBody(status: VerificationStatus, locale = 'es'): string {
  return locale.toLowerCase().startsWith('en') ? status.bodyEn : status.bodyEs
}
