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
    4. Run the classifier pipeline via shared ``classify_to_simple`` (map+gate+mode).
    5. Optionally persist the observation (default: persist so users can review).
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import Observation
from app.db.schemas import SimpleClassificationResult
from app.services import unified_catalog as catalog
from app.services.classify_simple import classify_to_simple
from app.services.classify_simple import map_to_simple as _map_to_simple  # noqa: F401 — tests
from app.services.image_storage import store_observation_images
from app.services.multi_view_classifier import get_multi_view_classifier
from app.services.view_classifier import CANONICAL_VIEWS

router = APIRouter()


def _locale_from_form(locale: str | None) -> str:
    """Optional form locale; omit/blank → es; invalid raises ValueError (caller → 400)."""
    if locale is None or not str(locale).strip():
        return catalog.DEFAULT_LOCALE
    return catalog.normalize_locale(locale)


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
    locale: str | None = Form(
        default=None,
        description=(
            "Optional UI locale for localized safety/copy (es|ca|eu|en). "
            "Invalid values return HTTP 400 with supported list. Default: es."
        ),
    ),
    persist: bool = Form(default=True),
    db: Session = Depends(get_db),
) -> SimpleClassificationResult | JSONResponse:
    """Quick-classify endpoint: upload images, get predictions immediately.

    Creates a transient (or persisted) observation, stores images, and runs
    the full pipeline. Returns a simplified result for easy frontend consumption.

    New in multi-view v5 (ML_IMPROVEMENT_PROMPT §5.3):
        The optional ``view_types`` form field lets the client label each image
        with its canonical view (gills/front/habitat/detail). If omitted or
        shorter than the image list, the View Classifier auto-labels the rest.

    Locale (D-B5 / B-04): optional form ``locale``; omit → ``es``; invalid → 400
    with ``{error, supported}`` parity to species API; echoed on ``result.locale``.

    Honesty (B-05): mapping, quality gate, and mode are applied via shared
    ``classify_to_simple`` so async workers can reuse the same path later.
    """
    request_id = uuid.uuid4().hex[:12]
    start = time.perf_counter()

    try:
        resolved_locale = _locale_from_form(locale)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_locale",
                "supported": list(catalog.SUPPORTED_LOCALES),
            },
        )

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

    # Shared mapper: classify → map → gate → mode → locale (B-05)
    classifier = get_multi_view_classifier()
    simple_result = classify_to_simple(
        observation=observation,
        images=saved_images,
        view_types=parsed_view_types,
        locale=resolved_locale,
        request_id=request_id,
        classifier=classifier,
        loaded_weights_path=getattr(classifier, "resolved_weights_path", None),
    )
    # Wall-clock from request start (upload + classify), matching prior /classify semantics
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    simple_result = simple_result.model_copy(update={"processing_time_ms": elapsed_ms})

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
