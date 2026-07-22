/** API type definitions matching the FastAPI backend /classify endpoint. */

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