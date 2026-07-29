/**
 * Expert handoff payload — packages multi-view evidence for human review (S7).
 * Local draft + deep-link fields; does not authorize consumption.
 * B-37: snapshots product honesty mode + dual-signal quality_gate when present.
 * v1.5.4: pair-specific critical_views for lookalike mates (educational).
 */
import type {
  ClassificationResult,
  ClassifyMode,
  QualityGatePayload,
} from '../api/types'
import { isQualityGatePayload, resolveMode } from './classifyMode'
import type { HistoryEntry } from './observationHistory'
import {
  diagnosticForLookalikeMate,
  missingPairCriticalViews,
  type LookalikePairDiagnostic,
} from './diagnosticViews'
import type { CanonicalView } from './multiViewSlots'

export const EXPERT_HANDOFF_KEY = 'visionsetil_expert_handoff_draft'
export const EXPERT_HANDOFF_QUEUE_KEY = 'visionsetil_expert_handoff_queue'

/** Educational pair coach for a lookalike mate (expert review). */
export type HandoffLookalikeDiag = {
  mate: string
  pair_id: string | null
  why: string
  critical_views: CanonicalView[]
  /** Critical views not present in submitted view_types (soft guidance). */
  missing_critical_views: CanonicalView[]
  source: LookalikePairDiagnostic['source'] | null
}

export type ExpertHandoffDraft = {
  id: string
  created_at: number
  request_id: string | null
  observation_id: number | null
  decision: string
  top_species: string | null
  top_confidence: number | null
  safety_level: string | null
  view_types: string[]
  preview_count: number
  /** Data-URL or blob previews truncated to names only in export if huge */
  preview_urls: string[]
  missing_evidence: string[]
  dangerous_lookalikes: string[]
  /**
   * Pair-specific critical_views for top prediction × lookalike mates.
   * Educational only — never forage permission.
   */
  lookalike_diagnostics?: HandoffLookalikeDiag[]
  rejection_reason: string | null
  recommend_human_review: boolean
  notes: string
  safety_disclaimer: string
  /**
   * Product honesty mode snapshot (B-37). Optional for soft-compat with old drafts
   * that predate mode/quality_gate. New drafts always set via resolveMode().
   */
  mode?: ClassifyMode | null
  /**
   * Dual-signal quality gate snapshot at handoff time (B-37).
   * metrics_acceptable vs species_id_allowed. Null/absent on legacy drafts.
   */
  quality_gate?: QualityGatePayload | null
}

/**
 * Build lookalike diagnostic coaches for handoff (map-backed only).
 * Uses top predictions + dangerous_lookalikes; never invents pairs.
 */
export function buildLookalikeDiagnostics(
  result: ClassificationResult,
  viewTypes: readonly string[] = [],
): HandoffLookalikeDiag[] {
  const predictionTaxa = (result.predictions || [])
    .slice(0, 2)
    .map((p) => p.species)
    .filter(Boolean)
  const mates = result.dangerous_lookalikes || []
  const out: HandoffLookalikeDiag[] = []
  const seen = new Set<string>()
  for (const mate of mates) {
    const key = (mate || '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const diag = diagnosticForLookalikeMate(predictionTaxa, mate)
    if (!diag) {
      out.push({
        mate,
        pair_id: null,
        why: '',
        critical_views: [],
        missing_critical_views: [],
        source: null,
      })
      continue
    }
    out.push({
      mate,
      pair_id: diag.pair_id,
      why: diag.why,
      critical_views: diag.critical_views,
      missing_critical_views: missingPairCriticalViews(diag, viewTypes),
      source: diag.source,
    })
  }
  return out
}

export const HAND_OFF_DISCLAIMER =
  'Borrador de revisión experta. Orientación solamente — no es permiso de consumo. Un micólogo humano debe validar en el campo.'

/** Spanish labels for honesty mode (expert review surface). */
export function handoffModeLabelEs(mode: ClassifyMode | null | undefined): string {
  if (mode === 'real') return 'Modelo en vivo'
  if (mode === 'mock') return 'Modo demo'
  if (mode === 'blocked') return 'Bloqueado (gate)'
  return '—'
}

/** Spanish labels for quality_gate.verdict (metrics-only ACCEPTABLE/UNACCEPTABLE). */
export function handoffGateVerdictLabelEs(
  verdict: QualityGatePayload['verdict'] | null | undefined,
): string {
  if (verdict === 'ACCEPTABLE') return 'Aceptable'
  if (verdict === 'UNACCEPTABLE') return 'Inaceptable'
  return '—'
}

export function buildExpertHandoff(input: {
  result: ClassificationResult
  viewTypes?: string[]
  previews?: string[]
  notes?: string
}): ExpertHandoffDraft {
  const { result, viewTypes = [], previews = [], notes = '' } = input
  const top = result.predictions?.[0]
  const gate =
    result.quality_gate != null && isQualityGatePayload(result.quality_gate)
      ? result.quality_gate
      : null
  return {
    id: `handoff_${result.request_id || Date.now()}`,
    created_at: Date.now(),
    request_id: result.request_id ?? null,
    observation_id: result.observation_id ?? null,
    decision: result.decision,
    top_species: top?.species ?? null,
    top_confidence: top?.confidence ?? null,
    safety_level: result.safety_level ?? null,
    view_types: [...viewTypes],
    preview_count: previews.length,
    preview_urls: previews.slice(0, 10),
    missing_evidence: result.missing_evidence || [],
    dangerous_lookalikes: result.dangerous_lookalikes || [],
    lookalike_diagnostics: buildLookalikeDiagnostics(result, viewTypes),
    rejection_reason: result.rejection_reason ?? result.open_set_reason ?? null,
    recommend_human_review: Boolean(result.recommend_human_review),
    notes: notes.trim(),
    safety_disclaimer: HAND_OFF_DISCLAIMER,
    // B-37 dual signals: always resolve mode; snapshot gate when payload is valid
    mode: resolveMode(result),
    quality_gate: gate,
  }
}

export function buildHandoffFromHistory(entry: HistoryEntry, notes = ''): ExpertHandoffDraft {
  return buildExpertHandoff({
    result: entry.result as ClassificationResult,
    viewTypes: entry.view_types || [],
    previews: entry.previews || [],
    notes,
  })
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function saveHandoffDraft(
  draft: ExpertHandoffDraft,
  storage: StorageLike = localStorage,
): void {
  storage.setItem(EXPERT_HANDOFF_KEY, JSON.stringify(draft))
  // Also append to queue (cap 20)
  let queue: ExpertHandoffDraft[] = []
  try {
    const raw = storage.getItem(EXPERT_HANDOFF_QUEUE_KEY)
    if (raw) queue = JSON.parse(raw) as ExpertHandoffDraft[]
  } catch {
    queue = []
  }
  queue = [draft, ...queue.filter((d) => d.id !== draft.id)].slice(0, 20)
  storage.setItem(EXPERT_HANDOFF_QUEUE_KEY, JSON.stringify(queue))
}

export function loadHandoffDraft(storage: StorageLike = localStorage): ExpertHandoffDraft | null {
  try {
    const raw = storage.getItem(EXPERT_HANDOFF_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ExpertHandoffDraft
  } catch {
    return null
  }
}

export function loadHandoffQueue(storage: StorageLike = localStorage): ExpertHandoffDraft[] {
  try {
    const raw = storage.getItem(EXPERT_HANDOFF_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpertHandoffDraft[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Path + query for expert review page with packaged context id. */
export function expertReviewPath(draftId?: string): string {
  if (!draftId) return '/revision-experta'
  return `/revision-experta?handoff=${encodeURIComponent(draftId)}`
}

/**
 * Plain-text summary for WhatsApp / email to a human mycologist.
 * Educational only — never consumption language.
 */
export function formatHandoffSummary(draft: ExpertHandoffDraft): string {
  const conf =
    draft.top_confidence != null
      ? `${(draft.top_confidence * 100).toFixed(1)}%`
      : '—'
  const views = draft.view_types?.length ? draft.view_types.join(', ') : 'Sin etiquetas'
  const looks = draft.dangerous_lookalikes?.length
    ? draft.dangerous_lookalikes.slice(0, 6).join(', ')
    : '—'
  const missing = draft.missing_evidence?.length
    ? draft.missing_evidence.join(', ')
    : '—'
  const diagLines: string[] = []
  for (const d of draft.lookalike_diagnostics || []) {
    if (!d.critical_views?.length && !d.why) continue
    const viewsCrit = d.critical_views.length
      ? d.critical_views.join(', ')
      : '—'
    const miss = d.missing_critical_views?.length
      ? d.missing_critical_views.join(', ')
      : 'ninguna (o sin mapa)'
    diagLines.push(
      `  · ${d.mate}: vistas discriminantes=${viewsCrit}` +
        (d.why ? ` · ${d.why}` : '') +
        ` · faltan en paquete=${miss}`,
    )
  }
  const lines = [
    'VisionSetil — borrador de revisión experta',
    HAND_OFF_DISCLAIMER,
    '',
    `Fecha: ${new Date(draft.created_at).toLocaleString()}`,
    `ID: ${draft.id}`,
    `Decisión app: ${draft.decision}`,
    `Taxón top: ${draft.top_species || '—'}`,
    `Confianza top: ${conf}`,
    `Riesgo/safety: ${draft.safety_level || '—'}`,
    `Modo: ${handoffModeLabelEs(draft.mode)}`,
    `Vistas: ${views}`,
    `Fotos empaquetadas: ${draft.preview_count}`,
    `Lookalikes peligrosos: ${looks}`,
    diagLines.length
      ? `Diagnóstico multi-vista (educativo):\n${diagLines.join('\n')}`
      : null,
    `Evidencia faltante: ${missing}`,
    draft.rejection_reason ? `Motivo rechazo: ${draft.rejection_reason}` : null,
    draft.notes ? `Notas: ${draft.notes}` : null,
    draft.quality_gate
      ? `Gate: ${handoffGateVerdictLabelEs(draft.quality_gate.verdict)} · ID especie ${
          draft.quality_gate.species_id_allowed ? 'permitida' : 'bloqueada'
        }`
      : null,
    '',
    'No es permiso de consumo ni identificación certificada.',
  ]
  return lines.filter((l) => l != null).join('\n')
}

export async function copyHandoffSummary(
  draft: ExpertHandoffDraft,
): Promise<{ ok: boolean; error?: string }> {
  const text = formatHandoffSummary(draft)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return { ok: true }
    }
    return { ok: false, error: 'Portapapeles no disponible' }
  } catch {
    return { ok: false, error: 'No se pudo copiar' }
  }
}

export function downloadHandoffJson(draft: ExpertHandoffDraft, filename?: string): void {
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `visionsetil-handoff-${draft.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}
