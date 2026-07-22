/** API type definitions matching the FastAPI backend /classify endpoint. */

export interface SpeciesPrediction {
  species: string
  common_name: string | null
  confidence: number
  edibility: string | null
  /** Catalog slug when hydrated (B-32+) — drives SpeciesImage media path */
  slug?: string | null
  /** Risk label from catalog hydrate (deadly/high/…); preferred over edibility for placeholders */
  risk_level?: string | null
  image_card_url?: string | null
  image_thumb_url?: string | null
  /** True when prediction matched catalog_v2 on the server */
  in_catalog?: boolean
}

export interface ModelStack {
  detector: string
  visual_embedder: string
  image_text_embedder: string
  metadata_encoder: string
}

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