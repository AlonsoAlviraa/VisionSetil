"""
Convenience endpoint: POST /classify

Accepts one or more images + optional metadata, creates a transient observation,
runs the full classification pipeline, and returns a simplified result that the
frontend can consume directly. This bridges the gap between the frontend's simple
UX and the backend's rich observation-based API.

Flow:
    1. Validate uploaded images (extension, magic bytes, size).
    2. Create a transient Observation with the provided metadata.
    3. Store images and attach them to the observation.
    4. Run the classifier pipeline.
    5. Map the rich ClassificationResponse → SimpleClassificationResult.
    6. Optionally persist the observation (default: persist so users can review).
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import (
    ClassificationResponse,
    SimpleClassificationResult,
    SimpleSpeciesPrediction,
)
from app.services.classifier import MockMushroomClassifier
from app.services.image_storage import store_observation_images
from app.services.multi_view_classifier import get_multi_view_classifier
from app.services.view_classifier import CANONICAL_VIEWS

router = APIRouter()


def _build_observation(
    title: str | None,
    country: str | None,
    region: str | None,
    habitat: str | None,
    substrate: str | None,
    notes: str | None,
    smell: str | None,
) -> Observation:
    """Create an Observation ORM object from form metadata."""
    return Observation(
        title=title or "Clasificación rápida",
        country=country or None,
        region=region or None,
        habitat=habitat or None,
        substrate=substrate or None,
        notes=notes or None,
        smell=smell or None,
        nearby_trees=[],
    )


def _map_to_simple(
    result: ClassificationResponse,
    request_id: str,
    processing_time_ms: int,
    *,
    classifier: object | None = None,
) -> SimpleClassificationResult:
    """Convert the rich ClassificationResponse into the simplified frontend schema."""

    predictions: list[SimpleSpeciesPrediction] = []
    for candidate in result.top_candidates or result.candidates:
        predictions.append(
            SimpleSpeciesPrediction(
                species=candidate.taxon,
                common_name=None,
                confidence=candidate.confidence,
                edibility=candidate.edibility_label,
            )
        )

    # Determine decision from open-set analysis
    decision = "accepted"
    rejection_reason: str | None = None
    if result.open_set and result.open_set.is_unknown_or_uncertain:
        decision = "rejected"
        rejection_reason = result.open_set.reason

    confs = [p.confidence for p in predictions]
    margin = None
    if len(confs) >= 2:
        margin = round(max(0.0, confs[0] - confs[1]), 4)
    elif len(confs) == 1:
        margin = round(confs[0], 4)

    view_coverage: list[str] = []
    ml_notes: list[str] = []
    is_mock = True
    if classifier is not None:
        view_coverage = list(getattr(classifier, "last_view_coverage", []) or [])
        ml_notes = list(getattr(classifier, "last_ml_notes", []) or [])
        if getattr(classifier, "last_confidence_margin", None) is not None:
            margin = getattr(classifier, "last_confidence_margin")
        # MultiViewMushroomClassifier sets is_real
        if getattr(classifier, "is_real", False):
            is_mock = False
        stack = result.model_stack
        if stack and all(
            "mock" not in str(getattr(stack, f, "")).lower()
            for f in ("detector", "visual_embedder", "image_text_embedder", "metadata_encoder")
        ):
            is_mock = False

    simple = SimpleClassificationResult(
        request_id=request_id,
        decision=decision,
        predictions=predictions,
        rejection_reason=rejection_reason,
        processing_time_ms=processing_time_ms,
        observation_id=result.observation_id,
        safety_level=result.safety_level,
        missing_evidence=result.missing_evidence,
        warnings=result.warnings,
        quality_warnings=result.quality_assessment.quality_warnings,
        dangerous_lookalikes=result.dangerous_lookalikes,
        questions_for_user=result.questions_for_user,
        model_stack=result.model_stack,
        open_set_reason=rejection_reason,
        recommend_human_review=bool(result.human_review and result.human_review.recommended)
        or decision == "rejected",
        final_warning=result.final_warning,
        confidence_margin=margin,
        view_coverage=view_coverage,
        is_mock_stack=is_mock,
        ml_notes=ml_notes,
        locale="es",  # B-04 will add form field; default echo "es"
    )
    # Hard quality gate: always attach dual-signal quality_gate (D-B2 / D-B15)
    from app.ml.classify_mode import derive_classify_mode
    from app.ml.quality_gate import apply_quality_gate_to_simple_result

    gated = apply_quality_gate_to_simple_result(simple.model_dump())
    gate = gated.get("quality_gate") or {}
    # Stack truth is independent of mode (D-B1) — never overwrite is_mock_stack from mode
    is_mock_stack = bool(gated.get("is_mock_stack", True))
    gated["is_mock_stack"] = is_mock_stack
    gated["mode"] = derive_classify_mode(
        is_mock_stack=is_mock_stack,
        species_id_allowed=bool(gate.get("species_id_allowed", False)),
    )
    gated["locale"] = gated.get("locale") or "es"
    # quality_gate always present from apply_* (pass and fail) — do not strip
    return SimpleClassificationResult(**gated)


@router.post("/classify", response_model=SimpleClassificationResult)
async def classify_images(
    images: list[UploadFile] = File(...),
    title: str | None = Form(default=None),
    country: str | None = Form(default=None),
    region: str | None = Form(default=None),
    habitat: str | None = Form(default=None),
    substrate: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    smell: str | None = Form(default=None),
    view_types: str | None = Form(
        default=None,
        description=(
            "Optional comma-separated view labels, one per image "
            "(e.g. 'gills,front,habitat,detail'). If omitted, the backend "
            "auto-classifies each image with the View Classifier service. "
            f"Valid labels: {list(CANONICAL_VIEWS)}."
        ),
    ),
    persist: bool = Form(default=True),
    db: Session = Depends(get_db),
) -> SimpleClassificationResult:
    """Quick-classify endpoint: upload images, get predictions immediately.

    Creates a transient (or persisted) observation, stores images, and runs
    the full pipeline. Returns a simplified result for easy frontend consumption.

    New in multi-view v5 (ML_IMPROVEMENT_PROMPT §5.3):
        The optional ``view_types`` form field lets the client label each image
        with its canonical view (gills/front/habitat/detail). If omitted or
        shorter than the image list, the View Classifier auto-labels the rest.
    """
    request_id = uuid.uuid4().hex[:12]
    start = time.perf_counter()

    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    if len(images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images per request")

    # Check extension early for a better error
    for img in images:
        ext = (img.filename or "").rsplit(".", 1)[-1].lower() if img.filename else ""
        if ext and ext not in settings.allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported extension '{ext}'. Allowed: {sorted(settings.allowed_extensions)}",
            )

    # Parse view_types: comma-separated string → list[str], validated against canonical views.
    parsed_view_types = _parse_view_types(view_types, len(images))

    # Create observation
    observation = _build_observation(title, country, region, habitat, substrate, notes, smell)
    db.add(observation)
    db.commit()
    db.refresh(observation)

    try:
        saved_images = await store_observation_images(db, observation, images)
    except HTTPException:
        if not persist:
            db.delete(observation)
            db.commit()
        raise

    # Run classifier. Use the multi-view classifier, which gracefully falls back
    # to MockMushroomClassifier when real weights are absent.
    classifier = get_multi_view_classifier()
    if hasattr(classifier, "classify") and "view_types" in classifier.classify.__code__.co_varnames:
        result = classifier.classify(observation, saved_images, view_types=parsed_view_types)
    else:
        result = classifier.classify(observation, saved_images)

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    # Prefer mock fallback diagnostics when MultiView wraps Mock
    diag = getattr(classifier, "_mock_fallback", None) or classifier
    simple_result = _map_to_simple(result, request_id, elapsed_ms, classifier=diag)

    # If not persisting, delete the observation and images
    if not persist:
        db.delete(observation)
        db.commit()
    else:
        # Store classification result on the observation
        observation.last_classification = _serialize_result(simple_result)
        db.commit()

    return simple_result


def _parse_view_types(view_types: str | None, n_images: int) -> list[str] | None:
    """Parse the comma-separated ``view_types`` form field.

    Returns ``None`` if the field is absent (letting the view classifier
    auto-label everything), or a list of canonical view labels padded/truncated
    to ``n_images``.

    Raises ``HTTPException(400)`` if any label is not a canonical view.
    """
    if not view_types:
        return None
    parts = [v.strip().lower() for v in view_types.split(",") if v.strip()]
    invalid = [p for p in parts if p not in CANONICAL_VIEWS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid view_types label(s): {invalid}. "
                f"Valid labels: {list(CANONICAL_VIEWS)}."
            ),
        )
    # If fewer labels than images, pad with None-equivalent (empty) so the
    # classifier knows to auto-label those.
    while len(parts) < n_images:
        parts.append("")
    return parts[:n_images]


def _serialize_result(result: SimpleClassificationResult) -> dict[str, Any]:
    """Serialize for DB storage."""
    return result.model_dump()
