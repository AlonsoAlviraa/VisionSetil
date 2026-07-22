/**
 * Expert handoff payload — packages multi-view evidence for human review (S7).
 * Local draft + deep-link fields; does not authorize consumption.
 * B-37: snapshots product honesty mode + dual-signal quality_gate when present.
 */
import type {
  ClassificationResult,
  ClassifyMode,
  QualityGatePayload,
} from '../api/types'
import { isQualityGatePayload, resolveMode } from './classifyMode'
import type { HistoryEntry } from './observationHistory'

export const EXPERT_HANDOFF_KEY = 'visionsetil_expert_handoff_draft'
export const EXPERT_HANDOFF_QUEUE_KEY = 'visionsetil_expert_handoff_queue'

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

export const HAND_OFF_DISCLAIMER =
  'Borrador de revisión experta. Orientación solamente — no es permiso de consumo. Un micólogo humano debe validar en el campo.'

/** Spanish labels for honesty mode (expert review surface). */
export function handoffModeLabelEs(mode: ClassifyMode | null | undefined): string {
  if (mode === 'real') return 'Modelo en vivo'
  if (mode === 'mock') return 'Modo demo'
  if (mode === 'blocked') return 'Bloqueado (gate)'
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
