/** API type definitions matching the FastAPI backend /classify endpoint. */

/** Product honesty mode (D-B1). Independent of is_mock_stack (stack truth). */
export type ClassifyMode = 'real' | 'mock' | 'blocked'

/** Stable machine codes from QualityGatePayload.reason_code (D-B15). */
export type QualityGateReasonCode =
  | 'no_metrics'
  | 'map_below'
  | 'deadly_below'
  | 'gates_passed'
  | 'gate_disabled'
  | 'unset'
  | (string & {})

/**
 * Dual-signal quality gate (D-B15): metrics_acceptable vs species_id_allowed.
 * - metrics_acceptable: raw MAP/deadly thresholds only — never forced by disable
 * - species_id_allowed: serve policy (respects block_enabled)
 * - verdict: tracks metrics only (ACCEPTABLE/UNACCEPTABLE), not gate-disable bypass
 * - metrics_path: always full path (D-B23), never basename-only
 */
export interface QualityGatePayload {
  species_id_allowed: boolean
  metrics_acceptable: boolean
  block_enabled: boolean
  reason: string
  reason_code: QualityGateReasonCode
  test_map_at_3?: number | null
  safety_recall_deadly?: number | null
  min_map_at_3?: number
  min_deadly_recall?: number
  /** Full path always (D-B23); never basename-only. */
  metrics_path?: string | null
  version?: string | null
  /** Tracks metrics_acceptable only — ACCEPTABLE | UNACCEPTABLE. */
  verdict: 'ACCEPTABLE' | 'UNACCEPTABLE'
}

export interface SpeciesPrediction {
  species: string
  common_name: string | null
  confidence: number
  edibility: string | null
  /** Catalog slug when hydrate finds a hit (Phase B). */
  slug?: string | null
  /**
   * Risk level from catalog hydrate (Phase B / B-42).
   * Prefer with edibility via resolveJoinRisk for RiskChip visibility.
   */
  risk_level?: string | null
  image_card_url?: string | null
  image_thumb_url?: string | null
  /** True only when server hydrate joined this taxon to catalog_v2. */
  in_catalog?: boolean
}

export interface ModelStack {
  detector: string
  visual_embedder: string
  image_text_embedder: string
  metadata_encoder: string
}

/** Product honesty mode (Phase B). Optional for legacy responses. */
export type ClassifyMode = 'real' | 'mock' | 'blocked'

export interface ClassificationResult {
  request_id: string
  decision: 'accepted' | 'rejected'
  predictions: SpeciesPrediction[]
  rejection_reason: string | null
  processing_time_ms: number
  observation_id: number | null
  safety_level: string
  missing_evidence: string[]
  warnings: string[]
  quality_warnings: string[]
  dangerous_lookalikes: string[]
  questions_for_user: string[]
  model_stack: ModelStack | null
  open_set_reason: string | null
  recommend_human_review: boolean
  final_warning: string
  /** Optional ML transparency fields (backend v4+) */
  confidence_margin?: number | null
  view_coverage?: string[]
  /** Stack truth (weights/backends); independent of mode (D-B1). */
  is_mock_stack?: boolean
  ml_notes?: string[]
  /**
   * Phase B honesty mode. B-42 boosts deadly/poisonous join chrome only when
   * `real` (or mode absent / legacy). Blocked keeps predictions empty.
   */
  mode?: ClassifyMode
}

export interface ApiError {
  error: string
  message: string
}

/** Re-export classify error taxonomy (B-29). Prefer `classifyApiError` from `./client`. */
export type { ApiErrorKind, ClassifiedApiError } from './classifyErrors'

/** Metadata that can be optionally submitted with images for better accuracy. */
export interface ObservationMetadata {
  title?: string
  country?: string
  region?: string
  habitat?: string
  substrate?: string
  notes?: string
  smell?: string
}

/** Job status from POST /classify/async and GET /jobs/{id}. */
export type ClassificationJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | (string & {})

/**
 * Async classification job status (ClassificationJobRead).
 * When completed, prefer GET /jobs/{id}/result for the dual-write envelope.
 */
export interface ClassificationJob {
  id: string
  observation_id: number
  status: ClassificationJobStatus
  /** May hold envelope when completed; product clients should still use /result. */
  result?: JobResultEnvelope | Record<string, unknown> | null
  error?: string | null
  created_at: string
  started_at?: string | null
  completed_at?: string | null
}

/**
 * Dual-write job result envelope (B-14 / D-B18 / D-B24).
 * Product clients must read `simple` only. `raw` is permanent admin/debug.
 */
export interface JobResultEnvelope {
  schema_version: 2
  simple: ClassificationResult
  raw?: Record<string, unknown> | null
}
