from datetime import date, datetime

from pydantic import BaseModel, Field


class ObservationCreate(BaseModel):
    title: str
    country: str | None = None
    region: str | None = None
    approx_location: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    habitat: str | None = None
    nearby_trees: list[str] = Field(default_factory=list)
    substrate: str | None = None
    altitude_m: float | None = None
    observed_at: date | None = None
    notes: str | None = None
    smell: str | None = None
    color_change_on_cut: str | None = None
    personal_collection: bool = True


class ObservationImageRead(BaseModel):
    id: int
    original_name: str
    stored_path: str
    size_bytes: int
    view_type: str | None = None
    crop_path: str | None = None
    mask_path: str | None = None

    model_config = {"from_attributes": True}


class ObservationRead(ObservationCreate):
    id: int
    created_at: datetime
    images: list[ObservationImageRead] = Field(default_factory=list)
    last_classification: dict | None = None

    model_config = {"from_attributes": True}


class CandidateResult(BaseModel):
    taxon: str
    rank: str
    confidence: float
    evidence_score: float = 0.0
    metadata_score: float = 0.0
    visual_score: float = 0.0
    species_visual_score: float = 0.0
    genus_visual_score: float = 0.0
    family_visual_score: float = 0.0
    taxonomic_score: float = 0.0
    prototype_quality: float = 0.0
    ranker_margin_to_next: float = 0.0
    dino_visual_score: float = 0.0
    siglip_image_text_score: float = 0.0
    siglip_visual_score: float = 0.0
    risk_score: float = 0.0
    fusion_score: float = 0.0
    risk_level: str = "unknown"
    edibility_label: str = "unknown_or_risky"
    reasoning: list[str] = Field(default_factory=list)
    danger_notes: list[str]
    lookalikes: list[str]
    explanation: str = ""
    ranker_version: str | None = None
    similarity_metric: str | None = None
    ml_improvement_version: str | None = None


class QualityAssessmentResponse(BaseModel):
    sharpness_ok: bool
    lighting_ok: bool
    mushroom_large_enough: bool
    has_lower_view: bool
    has_base_view: bool
    has_environment_view: bool
    possible_multiple_species: bool
    obstruction_detected: bool
    heavy_compression_or_blur: bool
    quality_warnings: list[str] = Field(default_factory=list)


class TraceResponse(BaseModel):
    pipeline_version: str
    classifier_strategy: str
    segmentation_strategy: str
    visual_backbone_plan: list[str]
    metadata_fusion_plan: str
    open_set_strategy: str
    human_review_path: str
    ranker_version: str | None = None
    ml_improvement_version: str | None = None
    catalog_version: str | None = None
    similarity_metric: str | None = None
    index_metadata: dict | None = None
    index_path: str | None = None
    thresholds_path: str | None = None
    open_set_thresholds: str | None = None
    top1_score: float | None = None
    top1_margin: float | None = None
    open_set_reasons: list[str] = Field(default_factory=list)


class ModelStackResponse(BaseModel):
    detector: str
    visual_embedder: str
    image_text_embedder: str
    metadata_encoder: str


class OpenSetResponse(BaseModel):
    is_unknown_or_uncertain: bool
    reason: str
    top1_confidence: float | None = None
    top2_confidence: float | None = None
    margin: float | None = None
    entropy: float | None = None
    decision: str
    reasons: list[str] = Field(default_factory=list)
    thresholds_path: str | None = None
    thresholds_status: str | None = None


class HumanReviewResponse(BaseModel):
    recommended: bool
    priority: str
    reason: str
    request_id: int | None = None


class ClassificationResponse(BaseModel):
    observation_id: int
    status: str
    safety_level: str
    risk_state: str
    message: str
    model_stack: ModelStackResponse
    candidates: list[CandidateResult]
    top_candidates: list[CandidateResult]
    raw_candidates: list[CandidateResult] = Field(default_factory=list)
    missing_evidence: list[str]
    explanation: str
    questions_for_user: list[str]
    warnings: list[str]
    dangerous_lookalikes: list[str]
    quality_assessment: QualityAssessmentResponse
    trace: TraceResponse
    final_warning: str
    open_set: OpenSetResponse | None = None
    human_review: HumanReviewResponse | None = None


class ClassificationJobRead(BaseModel):
    """Schema for reading classification job status (Sprint N+4 SC-3)."""

    id: str
    observation_id: int
    status: str
    result: dict | None = None
    error: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class HumanReviewRequestCreate(BaseModel):
    priority: str = "low"
    reason: str


class HumanReviewRequestUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    reviewer_notes: str | None = None
    reviewer_taxon: str | None = None
    reviewer_confidence: float | None = None


class HumanReviewRequestRead(BaseModel):
    id: int
    observation_id: int
    status: str
    priority: str
    reason: str
    assigned_to: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None
    reviewer_notes: str | None = None
    reviewer_taxon: str | None = None
    reviewer_confidence: float | None = None

    model_config = {"from_attributes": True}


class StoredImageResult(BaseModel):
    id: int
    original_name: str
    stored_path: str
    size_bytes: int
    view_type: str | None = None
    crop_path: str | None = None
    mask_path: str | None = None

    model_config = {"from_attributes": True}


class ImageUploadResponse(BaseModel):
    observation_id: int
    uploaded_count: int
    images: list[StoredImageResult]


# ─── Simple classification schema (for the /classify convenience endpoint) ────


class SimpleSpeciesPrediction(BaseModel):
    """Simplified species prediction for the quick-classify endpoint."""

    species: str
    common_name: str | None = None
    confidence: float
    edibility: str | None = None


class SimpleClassificationResult(BaseModel):
    """Simplified result matching what the frontend expects from /classify."""

    request_id: str
    decision: str  # "accepted" | "rejected"
    predictions: list[SimpleSpeciesPrediction]
    rejection_reason: str | None = None
    processing_time_ms: int
    observation_id: int | None = None
    safety_level: str = "unknown_or_risky"
    missing_evidence: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    quality_warnings: list[str] = Field(default_factory=list)
    dangerous_lookalikes: list[str] = Field(default_factory=list)
    questions_for_user: list[str] = Field(default_factory=list)
    model_stack: ModelStackResponse | None = None
    open_set_reason: str | None = None
    recommend_human_review: bool = False
    final_warning: str = ""
