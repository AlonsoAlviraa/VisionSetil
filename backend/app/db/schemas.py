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
    risk_level: str = "unknown"
    edibility_label: str = "unknown_or_risky"
    reasoning: list[str] = Field(default_factory=list)
    danger_notes: list[str]
    lookalikes: list[str]
    explanation: str = ""


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


class ModelStackResponse(BaseModel):
    detector: str
    visual_embedder: str
    image_text_embedder: str
    metadata_encoder: str


class ClassificationResponse(BaseModel):
    observation_id: int
    status: str
    safety_level: str
    risk_state: str
    message: str
    model_stack: ModelStackResponse
    candidates: list[CandidateResult]
    top_candidates: list[CandidateResult]
    missing_evidence: list[str]
    explanation: str
    questions_for_user: list[str]
    warnings: list[str]
    dangerous_lookalikes: list[str]
    quality_assessment: QualityAssessmentResponse
    trace: TraceResponse
    final_warning: str


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
