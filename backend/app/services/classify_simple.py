"""Shared classify → SimpleClassificationResult mapper (Phase B / B-05 + B-32).

Single path for map + quality gate + mode + locale + catalog hydrate so sync
``POST /classify`` and async workers (B-14) apply identical honesty/safety
semantics and rich prediction cards (vernaculars, risk, media URLs).
"""

from __future__ import annotations

import time
from typing import Any

from app.db.models import Observation
from app.db.schemas import (
    ClassificationResponse,
    SimpleClassificationResult,
    SimpleSpeciesPrediction,
)
from app.ml.classify_mode import derive_classify_mode
from app.ml.quality_gate import apply_quality_gate_to_simple_result
from app.services import unified_catalog as catalog
from app.services.multi_view_classifier import get_multi_view_classifier
from app.services.prediction_hydrate import hydrate_prediction


def map_to_simple(
    result: ClassificationResponse,
    request_id: str,
    processing_time_ms: int,
    *,
    classifier: object | None = None,
    loaded_weights_path: str | None = None,
    locale: str = "es",
) -> SimpleClassificationResult:
    """Convert ClassificationResponse → SimpleClassificationResult with gate+mode.

    ``loaded_weights_path`` is the multi-view checkpoint actually resolved for
    serve (D-B12). Prefer the outer MultiView classifier path even when
    ``classifier`` is a mock fallback used for diagnostics.

    ``locale`` is the resolved form locale (D-B5); default ``es`` when omitted.
    Predictions are hydrated from catalog_v2 after the gate when species ID is allowed.
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
    out = SimpleClassificationResult(**gated)
    return _hydrate_simple_result(out, locale=locale)


def _hydrate_simple_result(
    result: SimpleClassificationResult,
    *,
    locale: str,
) -> SimpleClassificationResult:
    """Hydrate prediction cards from catalog_v2 + media (B-32).

    Only when ``species_id_allowed`` and there are predictions left after the gate
    (sequence: map → gate → mode → hydrate). Skips when blocked/empty so Identify
    does not dress empty shells.
    """
    gate = result.quality_gate
    if gate is not None and not bool(getattr(gate, "species_id_allowed", False)):
        return result
    if not result.predictions:
        return result

    hydrated = [
        hydrate_prediction(
            p.species,
            p.confidence,
            p.edibility,
            locale or result.locale or catalog.DEFAULT_LOCALE,
        )
        for p in result.predictions
    ]
    return result.model_copy(update={"predictions": hydrated})


def classify_to_simple(
    *,
    observation: Observation,
    images: list[Any],
    view_types: list[str] | None,
    locale: str,
    request_id: str,
    classifier: object | None = None,
    processing_time_ms: int | None = None,
    loaded_weights_path: str | None = None,
) -> SimpleClassificationResult:
    """Run multi-view (or injected) classifier → map → gate → mode → hydrate.

    Shared by ``routes_classify`` and (later) ``task_queue.run_classification_job``
    so gate+mode+locale stay in lockstep for sync and async (safety-critical).
    """
    outer = classifier if classifier is not None else get_multi_view_classifier()
    start = time.perf_counter()

    if hasattr(outer, "classify") and "view_types" in outer.classify.__code__.co_varnames:
        result = outer.classify(observation, images, view_types=view_types)
    else:
        result = outer.classify(observation, images)

    elapsed = (
        processing_time_ms
        if processing_time_ms is not None
        else int((time.perf_counter() - start) * 1000)
    )

    # Prefer mock fallback diagnostics when MultiView wraps Mock
    diag = getattr(outer, "_mock_fallback", None) or outer
    # D-B12: always take resolved path from the multi-view outer (not mock fallback)
    weights = loaded_weights_path
    if weights is None:
        weights = getattr(outer, "resolved_weights_path", None)

    return map_to_simple(
        result,
        request_id,
        elapsed,
        classifier=diag,
        loaded_weights_path=weights,
        locale=locale,
    )
