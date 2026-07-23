"""
Convenience endpoint: POST /classify

**Identify product path** (Phase B D-B17 / B-47): the public Identify surface
(``/identificar`` and product clients) uses **only** this endpoint (and optional
async simple job). ``POST /observations/{id}/classify-advanced`` is admin/internal
and returns a different schema family — see ``routes_classification.py``.

Accepts one or more images + optional metadata, creates a transient observation,
runs the full classification pipeline, and returns a simplified result that the
frontend can consume directly. This bridges the gap between the frontend's simple
UX and the backend's rich observation-based API.

Flow:
    1. Validate uploaded images (extension, magic bytes, size).
    2. Resolve optional ``locale`` form (invalid → HTTP 400; default ``es``).
    3. Create a transient Observation with the provided metadata.
    4. Store images and attach them to the observation.
    5. Run the classifier pipeline.
    6. Map ClassificationResponse → SimpleClassificationResult with honesty fields
       (``mode``, ``quality_gate`` dual signals, ``locale`` echo, ``is_mock_stack``).
    7. Optionally persist the observation (default: persist so users can review).

Honesty contract (Phase B / D-B1…D-B5, D-B15)
---------------------------------------------
``mode`` is product honesty; ``is_mock_stack`` is stack truth (weights loaded).
They are independent — never derive one from the other.

**mode derivation** (gate > mock > real):
    not species_id_allowed → blocked
    species_id_allowed + is_mock_stack → mock
    species_id_allowed + real weights → real

**mode × decision matrix** (``decision`` is open-set / abstention, not mode):

| mode    | decision | meaning                                      | predictions          |
|---------|----------|----------------------------------------------|----------------------|
| blocked | rejected | Gate/policy: species ID not allowed          | always ``[]``        |
| mock    | accepted | Demo stack; policy allows ID                 | demo preds OK        |
| mock    | rejected | Demo + open-set abstention                   | may be empty         |
| real    | accepted | Live model orientation                       | top-k                |
| real    | rejected | Open-set / evidence abstention (model OK)    | may be empty/low conf|

**quality_gate dual signals** (always present on 200):
    - ``metrics_acceptable`` — raw MAP@3 / deadly-recall thresholds only;
      never forced true by gate-disable.
    - ``species_id_allowed`` — serve policy (respects ``block_enabled``).
    - ``verdict`` — tracks metrics only (``ACCEPTABLE`` / ``UNACCEPTABLE``).
    - ``reason_code`` — ``no_metrics`` | ``map_below`` | ``deadly_below`` |
      ``gates_passed`` | ``gate_disabled`` | ``unset``.

**locale**: optional form ``es|ca|eu|en``; omit/blank → ``es``; invalid →
HTTP 400 ``{"error":"invalid_locale","supported":["es","ca","eu","en"]}``;
echoed on ``result.locale``.
"""

from __future__ import annotations

import asyncio
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
from app.services.prediction_hydrate import (
    hydrate_prediction as _hydrate_prediction,  # noqa: F401 — orphan test import path
)
from app.services.view_classifier import CANONICAL_VIEWS

router = APIRouter()

# OpenAPI response examples for the honesty contract (B-13). Kept compact so
# Swagger/ReDoc stay readable; full schema is SimpleClassificationResult.
_OPENAPI_CLASSIFY_EXAMPLES: dict[str, Any] = {
    "blocked_gate": {
        "summary": "mode=blocked (gate fails → species ID stripped)",
        "description": (
            "Quality gate policy denies species ID. mode is blocked, decision is "
            "rejected, predictions are always empty. quality_gate dual signals: "
            "metrics_acceptable=false and species_id_allowed=false. Gate-deny "
            "side-effects from apply_quality_gate_to_simple_result: "
            "rejection_reason/open_set_reason=model_quality_gate_failed…, "
            "safety_level=unsafe_to_consume, GATE warning, final_warning NO IDENTIFICACIÓN."
        ),
        "value": {
            "request_id": "a1b2c3d4e5f6",
            "decision": "rejected",
            "predictions": [],
            "rejection_reason": (
                "model_quality_gate_failed: MAP@3=0.05 deadly_recall=0.5 "
                "— identificación de especie BLOQUEADA"
            ),
            "processing_time_ms": 120,
            "observation_id": 42,
            "safety_level": "unsafe_to_consume",
            "missing_evidence": [],
            "warnings": [
                (
                    "GATE DE CALIDAD: el modelo actual NO es aceptable para identificar "
                    "especies (MAP@3=0.05, recall mortales=0.5). "
                    "Solo modo educativo / abstención. Consulta a un micólogo."
                ),
            ],
            "quality_warnings": [],
            "dangerous_lookalikes": [],
            "questions_for_user": [],
            "model_stack": None,
            "open_set_reason": (
                "model_quality_gate_failed: MAP@3=0.05 deadly_recall=0.5 "
                "— identificación de especie BLOQUEADA"
            ),
            "recommend_human_review": True,
            "final_warning": (
                "NO IDENTIFICACIÓN. El modelo no supera el umbral de calidad. "
                "Nunca consumas setas basándote en esta aplicación."
            ),
            "confidence_margin": None,
            "view_coverage": ["front"],
            "is_mock_stack": False,
            "ml_notes": ["quality_gate=UNACCEPTABLE: map_at_3=0.0500<0.2 (unacceptable)"],
            "mode": "blocked",
            "quality_gate": {
                "species_id_allowed": False,
                "metrics_acceptable": False,
                "block_enabled": True,
                "reason": "map_at_3=0.0500<0.2 (unacceptable)",
                "reason_code": "map_below",
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.5,
                "min_map_at_3": 0.2,
                "min_deadly_recall": 0.9,
                "metrics_path": "/repo/kaggle/kernel_output_v9/models/metrics.json",
                "version": "v9",
                "verdict": "UNACCEPTABLE",
            },
            "locale": "es",
        },
    },
    "mock_accepted": {
        "summary": "mode=mock + decision=accepted (demo stack, gate policy allows)",
        "description": (
            "Demo/mock weights with species_id_allowed=true. Predictions may be "
            "present for UX; confidence UI should treat as N/A (not field ID)."
        ),
        "value": {
            "request_id": "b2c3d4e5f6a1",
            "decision": "accepted",
            "predictions": [
                {
                    "species": "Amanita muscaria",
                    "common_name": None,
                    "confidence": 0.72,
                    "edibility": "toxic",
                    "slug": None,
                    "risk_level": None,
                    "image_card_url": None,
                    "image_thumb_url": None,
                    "in_catalog": False,
                }
            ],
            "rejection_reason": None,
            "processing_time_ms": 80,
            "observation_id": 43,
            "safety_level": "unknown_or_risky",
            "missing_evidence": [],
            "warnings": [],
            "quality_warnings": [],
            "dangerous_lookalikes": [],
            "questions_for_user": [],
            "model_stack": None,
            "open_set_reason": None,
            "recommend_human_review": False,
            "final_warning": "",
            "confidence_margin": 0.15,
            "view_coverage": ["front", "gills"],
            "is_mock_stack": True,
            "ml_notes": ["mock_stack"],
            "mode": "mock",
            "quality_gate": {
                "species_id_allowed": True,
                "metrics_acceptable": False,
                "block_enabled": False,
                "reason": "gate_disabled (no_metrics_on_disk)",
                "reason_code": "gate_disabled",
                "test_map_at_3": None,
                "safety_recall_deadly": None,
                "min_map_at_3": 0.2,
                "min_deadly_recall": 0.9,
                "metrics_path": None,
                "version": None,
                "verdict": "UNACCEPTABLE",
            },
            "locale": "es",
        },
    },
    "real_accepted": {
        "summary": "mode=real + decision=accepted (live model, open-set OK)",
        "description": (
            "Real weights + metrics pass + open-set accepts. Confidence UI only "
            "when mode=real AND quality_gate.metrics_acceptable=true."
        ),
        "value": {
            "request_id": "c3d4e5f6a1b2",
            "decision": "accepted",
            "predictions": [
                {
                    "species": "Boletus edulis",
                    "common_name": None,
                    "confidence": 0.88,
                    "edibility": "edible",
                    "slug": None,
                    "risk_level": None,
                    "image_card_url": None,
                    "image_thumb_url": None,
                    "in_catalog": False,
                }
            ],
            "rejection_reason": None,
            "processing_time_ms": 340,
            "observation_id": 44,
            "safety_level": "unknown_or_risky",
            "missing_evidence": [],
            "warnings": [],
            "quality_warnings": [],
            "dangerous_lookalikes": [],
            "questions_for_user": [],
            "model_stack": None,
            "open_set_reason": None,
            "recommend_human_review": False,
            "final_warning": "",
            "confidence_margin": 0.22,
            "view_coverage": ["front", "gills", "habitat"],
            "is_mock_stack": False,
            "ml_notes": [],
            "mode": "real",
            "quality_gate": {
                "species_id_allowed": True,
                "metrics_acceptable": True,
                "block_enabled": True,
                "reason": "gates_passed",
                "reason_code": "gates_passed",
                "test_map_at_3": 0.45,
                "safety_recall_deadly": 0.95,
                "min_map_at_3": 0.2,
                "min_deadly_recall": 0.9,
                "metrics_path": "/repo/kaggle/kernel_output_v14/models/metrics.json",
                "version": "v14",
                "verdict": "ACCEPTABLE",
            },
            "locale": "en",
        },
    },
    "real_rejected_open_set": {
        "summary": "mode=real + decision=rejected (open-set abstention)",
        "description": (
            "Live model allowed, but open-set abstains. mode stays real; "
            "decision/rejection_reason encode uncertainty — do not treat as gate block."
        ),
        "value": {
            "request_id": "d4e5f6a1b2c3",
            "decision": "rejected",
            "predictions": [],
            "rejection_reason": "open_set_uncertain",
            "processing_time_ms": 290,
            "observation_id": 45,
            "safety_level": "unknown_or_risky",
            "missing_evidence": ["gills"],
            "warnings": [],
            "quality_warnings": [],
            "dangerous_lookalikes": [],
            "questions_for_user": [],
            "model_stack": None,
            "open_set_reason": "open_set_uncertain",
            "recommend_human_review": True,
            "final_warning": "",
            "confidence_margin": None,
            "view_coverage": ["front"],
            "is_mock_stack": False,
            "ml_notes": [],
            "mode": "real",
            "quality_gate": {
                "species_id_allowed": True,
                "metrics_acceptable": True,
                "block_enabled": True,
                "reason": "gates_passed",
                "reason_code": "gates_passed",
                "test_map_at_3": 0.45,
                "safety_recall_deadly": 0.95,
                "min_map_at_3": 0.2,
                "min_deadly_recall": 0.9,
                "metrics_path": "/repo/kaggle/kernel_output_v14/models/metrics.json",
                "version": "v14",
                "verdict": "ACCEPTABLE",
            },
            "locale": "ca",
        },
    },
}

_OPENAPI_LOCALE_400_EXAMPLE: dict[str, Any] = {
    "summary": "Invalid locale form field",
    "description": (
        "locale must be one of es|ca|eu|en (parity with species API). "
        "Omit or blank defaults to es; invalid values return this body."
    ),
    "value": {
        "error": "invalid_locale",
        "supported": list(catalog.SUPPORTED_LOCALES),
    },
}


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


def _map_to_simple(
    result: ClassificationResponse,
    request_id: str,
    processing_time_ms: int,
    *,
    classifier: object | None = None,
    loaded_weights_path: str | None = None,
    locale: str = "es",
) -> SimpleClassificationResult:
    """Convert the rich ClassificationResponse into the simplified frontend schema.

    ``loaded_weights_path`` is the multi-view checkpoint actually resolved for
    serve (D-B12). Prefer the outer MultiView classifier path even when
    ``classifier`` is a mock fallback used for diagnostics.

    ``locale`` is the resolved form locale (D-B5); default ``es`` when omitted.
    """

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
        locale=locale,
    )
    # Hard quality gate: always attach dual-signal quality_gate (D-B2 / D-B15)
    from app.ml.classify_mode import derive_classify_mode
    from app.ml.quality_gate import apply_quality_gate_to_simple_result

    # D-B12: prefer explicit serve path; else classifier.resolved_weights_path
    weights_path = loaded_weights_path
    if weights_path is None and classifier is not None:
        weights_path = getattr(classifier, "resolved_weights_path", None)

    gated = apply_quality_gate_to_simple_result(
        simple.model_dump(),
        loaded_weights_path=weights_path,
    )
    gate = gated.get("quality_gate") or {}
    # Stack truth is independent of mode (D-B1) — never overwrite is_mock_stack from mode
    is_mock_stack = bool(gated.get("is_mock_stack", True))
    gated["is_mock_stack"] = is_mock_stack
    gated["mode"] = derive_classify_mode(
        is_mock_stack=is_mock_stack,
        species_id_allowed=bool(gate.get("species_id_allowed", False)),
    )
    gated["locale"] = locale or gated.get("locale") or catalog.DEFAULT_LOCALE
    # quality_gate always present from apply_* (pass and fail) — do not strip
    return SimpleClassificationResult(**gated)


@router.post(
    "/classify",
    response_model=SimpleClassificationResult,
    summary="Classify mushroom images (honesty contract)",
    response_description=(
        "SimpleClassificationResult with required honesty fields: mode "
        "(real|mock|blocked), quality_gate dual signals, locale echo, "
        "and is_mock_stack (stack truth, independent of mode)."
    ),
    responses={
        200: {
            "description": (
                "Classification with honesty contract. Always includes ``mode``, "
                "``quality_gate`` (metrics_acceptable + species_id_allowed), and "
                "``locale``. See examples for mode×decision combinations."
            ),
            "content": {
                "application/json": {
                    "examples": _OPENAPI_CLASSIFY_EXAMPLES,
                }
            },
        },
        400: {
            "description": (
                "Bad request: missing/too many images, bad extension, invalid "
                "view_types, or **invalid locale**. Locale errors use a stable "
                "body ``{error: invalid_locale, supported: [...]}`` (not the "
                "generic HTTPException detail string)."
            ),
            "content": {
                "application/json": {
                    "examples": {
                        "invalid_locale": _OPENAPI_LOCALE_400_EXAMPLE,
                        "missing_images": {
                            "summary": "No images uploaded",
                            "value": {"detail": "At least one image is required"},
                        },
                    }
                }
            },
        },
    },
)
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
            "Optional UI locale (es|ca|eu|en). Omit/blank → es. Invalid → HTTP 400 "
            "with body {error: 'invalid_locale', supported: ['es','ca','eu','en']}. "
            "Echoed on result.locale (D-B5)."
        ),
        openapi_examples={
            "default_es": {"summary": "Omit (defaults to es)", "value": None},
            "catalan": {"summary": "Catalan", "value": "ca"},
            "invalid": {
                "summary": "Invalid (→ 400)",
                "value": "fr",
                "description": "Returns {error: invalid_locale, supported: [...]}",
            },
        },
    ),
    persist: bool = Form(default=True),
    db: Session = Depends(get_db),
) -> SimpleClassificationResult | JSONResponse:
    """Quick-classify endpoint: upload images, get predictions immediately.

    Creates a transient (or persisted) observation, stores images, and runs
    the full pipeline. Returns a simplified result for easy frontend consumption.

    ---
    ## Honesty contract (Phase B)

    Every **200** response includes:

    | Field | Role |
    | --- | --- |
    | ``mode`` | Product honesty: ``real`` \\| ``mock`` \\| ``blocked`` |
    | ``is_mock_stack`` | Stack truth (weights/backends). **Never** derived from ``mode`` |
    | ``quality_gate`` | Dual-signal gate payload (always present) |
    | ``locale`` | Echo of resolved form locale (default ``es``) |
    | ``decision`` | ``accepted`` \\| ``rejected`` — open-set / abstention, **orthogonal** to mode |

    ### mode × decision

    - **blocked + rejected** — gate/policy forbids species ID; ``predictions`` always ``[]``.
      UI: educational shell; hide confidence.
    - **mock + accepted|rejected** — demo stack; policy allows ID. Demo preds OK when
      accepted; confidence UI N/A (not field identification).
    - **real + accepted** — live model orientation; confidence UI only if
      ``quality_gate.metrics_acceptable`` is true.
    - **real + rejected** — open-set / evidence abstention while species ID is allowed;
      de-emphasize confidence; use ``rejection_reason`` / ``open_set_reason``.

    Derivation order (D-B4): **gate > mock > real** via ``derive_classify_mode``.

    ### Dual signals on ``quality_gate``

    - ``metrics_acceptable`` — raw MAP@3 / deadly-recall only; **never** forced by disable.
    - ``species_id_allowed`` — serve policy (respects ``block_enabled``).
    - ``verdict`` — tracks metrics only (``ACCEPTABLE`` / ``UNACCEPTABLE``).
    - When gate is disabled: ``species_id_allowed=true``, ``reason_code=gate_disabled``,
      but ``metrics_acceptable`` may still be false (preflight must not lie about quality).

    ### Locale (D-B5)

    Optional form ``locale`` ∈ ``{es, ca, eu, en}``. Omit/blank → ``es``.
    **Invalid locale → HTTP 400** with
    ``{"error": "invalid_locale", "supported": ["es", "ca", "eu", "en"]}``
    (parity with species API). Successful responses echo the resolved locale on
    ``result.locale``.

    ---
    New in multi-view v5 (ML_IMPROVEMENT_PROMPT §5.3):
        The optional ``view_types`` form field lets the client label each image
        with its canonical view (gills/front/habitat/detail). If omitted or
        shorter than the image list, the View Classifier auto-labels the rest.
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

    max_images = int(getattr(settings, "max_images_per_request", 10) or 10)
    if len(images) > max_images:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {max_images} images per request",
        )

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

    # Shared mapper: classify → map → gate → mode → locale (B-05).
    # Run sync torch / DB fusion off the event loop so concurrent /health,
    # /media and preflight stay responsive under load (audit P2).
    classifier = get_multi_view_classifier()
    simple_result = await asyncio.to_thread(
        classify_to_simple,
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
