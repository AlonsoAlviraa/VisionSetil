"""B-14 async safety: worker uses classify_to_simple + dual-write envelope.

Safety-critical: when the quality gate denies species ID, ``simple.predictions``
must be empty (no ungated product predictions). ``raw`` is kept permanently
for admin/debug (D-B18 / D-B24).
"""

from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.database import Base
from app.db.models import Observation, ObservationImage
from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    HumanReviewResponse,
    JobResultEnvelope,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.ml.quality_gate import clear_metrics_cache
from app.services.classify_simple import (
    JOB_RESULT_SCHEMA_VERSION,
    build_job_result_envelope,
    classify_to_simple_with_raw,
)
from app.services.task_queue import create_job, run_classification_job

_JPEG_MAGIC = b"\xff\xd8\xff\xe0"


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_metrics_cache()
    yield
    clear_metrics_cache()


def _make_raw_response(
    *,
    observation_id: int = 1,
    taxon: str = "Amanita muscaria",
    confidence: float = 0.85,
) -> ClassificationResponse:
    cand = CandidateResult(
        taxon=taxon,
        rank="species",
        confidence=confidence,
        danger_notes=[],
        lookalikes=[],
        edibility_label="toxic",
    )
    return ClassificationResponse(
        observation_id=observation_id,
        status="orientation_only",
        safety_level="unknown_or_risky",
        risk_state="unknown",
        message="test",
        model_stack=ModelStackResponse(
            detector="mock",
            visual_embedder="mock",
            image_text_embedder="mock",
            metadata_encoder="mock",
        ),
        candidates=[cand],
        top_candidates=[cand],
        missing_evidence=[],
        explanation="",
        questions_for_user=[],
        warnings=[],
        dangerous_lookalikes=[],
        quality_assessment=QualityAssessmentResponse(
            sharpness_ok=True,
            lighting_ok=True,
            mushroom_large_enough=True,
            has_lower_view=False,
            has_base_view=False,
            has_environment_view=False,
            possible_multiple_species=False,
            obstruction_detected=False,
            heavy_compression_or_blur=False,
        ),
        trace=TraceResponse(
            pipeline_version="test",
            classifier_strategy="mock",
            segmentation_strategy="none",
            visual_backbone_plan=[],
            metadata_fusion_plan="none",
            open_set_strategy="none",
            human_review_path="none",
        ),
        final_warning="test",
        open_set=OpenSetResponse(
            is_unknown_or_uncertain=False,
            reason="ok",
            decision="accept",
        ),
        human_review=HumanReviewResponse(
            recommended=False, priority="low", reason="none"
        ),
    )


def _failing_gate_weights(tmp_path):
    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"fake-weights")
    (models / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.0,
                "version": "async-gate-fail",
            }
        ),
        encoding="utf-8",
    )
    return str(weights)


class _FakeClassifier:
    """Classifier that returns a rich raw response with species predictions."""

    def __init__(self, raw: ClassificationResponse, weights_path: str | None = None):
        self._raw = raw
        self.is_real = False
        self.last_view_coverage: list = []
        self.last_ml_notes: list = []
        self.last_confidence_margin = None
        self.resolved_weights_path = weights_path

    def classify(self, observation, images, view_types=None):
        return self._raw


def test_build_job_result_envelope_shape():
    raw = _make_raw_response()
    from app.services.classify_simple import map_to_simple

    simple = map_to_simple(raw, "req-env", 10, loaded_weights_path=None)
    envelope = build_job_result_envelope(simple, raw)

    assert envelope["schema_version"] == JOB_RESULT_SCHEMA_VERSION == 2
    assert "simple" in envelope and "raw" in envelope
    # Pydantic validates the dual-write contract
    JobResultEnvelope.model_validate(envelope)
    assert envelope["raw"] is not None
    assert envelope["raw"]["top_candidates"] or envelope["raw"]["candidates"]


def test_classify_to_simple_with_raw_gates_when_metrics_fail(tmp_path, monkeypatch):
    """Gate fail → simple.predictions empty; raw still carries candidates."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", True)
    weights = _failing_gate_weights(tmp_path)
    raw = _make_raw_response(taxon="Amanita phalloides", confidence=0.99)
    clf = _FakeClassifier(raw, weights_path=weights)

    observation = MagicMock()
    observation.id = 42

    simple, returned_raw = classify_to_simple_with_raw(
        observation=observation,
        images=[],
        view_types=None,
        locale="es",
        request_id="async-gate",
        classifier=clf,
        loaded_weights_path=weights,
    )

    # Raw is permanent and may still hold ungated model output
    assert returned_raw is raw
    assert returned_raw.top_candidates
    assert returned_raw.top_candidates[0].taxon == "Amanita phalloides"

    # Product simple MUST be gated
    assert simple.quality_gate.species_id_allowed is False
    assert simple.quality_gate.metrics_acceptable is False
    assert simple.decision == "rejected"
    assert simple.predictions == []
    assert simple.mode.value == "blocked" or str(simple.mode) == "blocked"

    envelope = build_job_result_envelope(simple, returned_raw)
    assert envelope["simple"]["predictions"] == []
    assert envelope["raw"] is not None
    # Safety: product path never exposes ungated preds via simple
    assert not envelope["simple"]["predictions"]
    # raw may still list species (admin/debug only)
    raw_cands = envelope["raw"].get("top_candidates") or envelope["raw"].get("candidates") or []
    assert len(raw_cands) >= 1


def test_run_classification_job_dual_write_no_ungated_simple(
    tmp_path, monkeypatch
):
    """Worker stores schema_version=2 envelope; simple has no preds when gate fails."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", True)
    weights = _failing_gate_weights(tmp_path)
    raw = _make_raw_response(taxon="Galerina marginata", confidence=0.91)

    # Isolated SQLite for the worker SessionLocal
    db_path = tmp_path / "job_safety.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr("app.services.task_queue.SessionLocal", TestingSessionLocal)

    clf = _FakeClassifier(raw, weights_path=weights)
    monkeypatch.setattr(
        "app.services.task_queue.get_multi_view_classifier",
        lambda: clf,
    )
    # classify_to_simple_with_raw also resolves classifier via get_multi_view when not passed;
    # worker passes classifier from get_multi_view_classifier — covered above.

    db = TestingSessionLocal()
    try:
        obs = Observation(
            title="async safety test",
            organization_id="default",
            nearby_trees=[],
        )
        db.add(obs)
        db.commit()
        db.refresh(obs)

        img = ObservationImage(
            observation_id=obs.id,
            original_name="cap.jpg",
            stored_name="cap_stored.jpg",
            stored_path=str(tmp_path / "cap.jpg"),
            size_bytes=100,
        )
        (tmp_path / "cap.jpg").write_bytes(_JPEG_MAGIC + b"test")
        db.add(img)
        db.commit()

        job = create_job(db, obs.id, organization_id="default")
        job_id = job.id
    finally:
        db.close()

    run_classification_job(job_id)

    db = TestingSessionLocal()
    try:
        from app.db.models import ClassificationJob

        job = db.get(ClassificationJob, job_id)
        assert job is not None
        assert job.status == "completed"
        assert job.result is not None

        result = job.result
        assert result["schema_version"] == 2
        assert "simple" in result
        assert "raw" in result

        simple = result["simple"]
        gate = simple.get("quality_gate") or {}
        assert gate.get("species_id_allowed") is False
        # SAFETY: no ungated species predictions on product simple
        assert simple.get("predictions") == []
        assert simple.get("decision") == "rejected"
        assert simple.get("mode") in ("blocked", "Blocked") or str(simple.get("mode")) == "blocked"

        # raw kept indefinitely (D-B24) and may still have candidates
        assert result["raw"] is not None
        raw_cands = (
            result["raw"].get("top_candidates")
            or result["raw"].get("candidates")
            or []
        )
        assert len(raw_cands) >= 1
        assert raw_cands[0]["taxon"] == "Galerina marginata"

        # Observation stores product simple (parity with /classify)
        obs = db.get(Observation, job.observation_id)
        assert obs is not None
        assert obs.last_classification is not None
        assert obs.last_classification.get("predictions") == []
    finally:
        db.close()


def test_get_job_result_returns_envelope_model(client, monkeypatch, tmp_path):
    """GET /jobs/{id}/result serializes dual-write envelope (schema_version 2)."""
    from datetime import UTC, datetime

    from app.db.models import ClassificationJob

    weights = _failing_gate_weights(tmp_path)
    raw = _make_raw_response(taxon="Amanita phalloides", confidence=0.95)
    from app.services.classify_simple import map_to_simple

    simple = map_to_simple(
        raw,
        "job-route",
        5,
        loaded_weights_path=weights,
    )
    envelope = build_job_result_envelope(simple, raw)
    assert envelope["simple"]["predictions"] == []

    fake_job = ClassificationJob(
        id="test-job-envelope-001",
        observation_id=1,
        organization_id="default",
        status="completed",
        result=envelope,
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
    )

    # routes_jobs imports get_job by name — patch the route module binding
    monkeypatch.setattr(
        "app.api.routes_jobs.get_job",
        lambda db, job_id: fake_job,
    )

    result_resp = client.get("/jobs/test-job-envelope-001/result")
    assert result_resp.status_code == 200, result_resp.text
    payload = result_resp.json()
    assert payload["schema_version"] == 2
    assert "simple" in payload
    assert "raw" in payload
    # SAFETY: gated simple has no species predictions
    assert payload["simple"]["predictions"] == []
    assert payload["simple"]["decision"] == "rejected"
    assert payload["raw"] is not None
    assert (
        payload["raw"].get("top_candidates") or payload["raw"].get("candidates")
    )
