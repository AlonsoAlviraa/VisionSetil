"""B-44 async form parity: view_types + locale on POST /classify/async.

Sync ``POST /classify`` already accepts these fields; async must accept the
same form contract and pass them into ``classify_to_simple`` so gated
``simple.locale`` and multi-view labels stay aligned.
"""

from __future__ import annotations

import io

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.db.models import Observation, ObservationImage
from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    HumanReviewResponse,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.ml.quality_gate import clear_metrics_cache
from app.services.task_queue import create_job, run_classification_job

_JPEG_MAGIC = b"\xff\xd8\xff\xe0"


def _make_png_bytes() -> bytes:
    """Minimal valid 1x1 PNG."""
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


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


class _CapturingClassifier:
    """Records view_types passed to classify; returns a fixed raw response."""

    def __init__(self, raw: ClassificationResponse):
        self._raw = raw
        self.is_real = False
        self.last_view_coverage: list = []
        self.last_ml_notes: list = []
        self.last_confidence_margin = None
        self.resolved_weights_path = None
        self.received_view_types: list[str] | None | object = object()

    def classify(self, observation, images, view_types=None):
        self.received_view_types = view_types
        return self._raw


# --------------------------------------------------------------------------- #
# Route form validation (HTTP layer)
# --------------------------------------------------------------------------- #
def test_async_accepts_view_types_and_locale(client):
    """POST /classify/async accepts view_types + locale and returns 202."""
    png = _make_png_bytes()
    response = client.post(
        "/classify/async",
        data={
            "view_types": "gills,front",
            "locale": "ca",
            "habitat": "bosque",
        },
        files=[
            ("images", ("a.png", io.BytesIO(png), "image/png")),
            ("images", ("b.png", io.BytesIO(png), "image/png")),
        ],
    )
    assert response.status_code == 202, response.text
    body = response.json()
    assert "id" in body
    assert body.get("status") in ("queued", "running", "completed")


def test_async_locale_omitted_defaults_still_202(client):
    """Omitting locale/view_types is allowed (defaults: locale=es, auto views)."""
    png = _make_png_bytes()
    response = client.post(
        "/classify/async",
        files=[("images", ("a.png", io.BytesIO(png), "image/png"))],
    )
    assert response.status_code == 202, response.text


def test_async_invalid_locale_returns_400(client):
    """Invalid locale → HTTP 400 with error + supported list (sync parity)."""
    png = _make_png_bytes()
    response = client.post(
        "/classify/async",
        data={"locale": "fr"},
        files=[("images", ("a.png", io.BytesIO(png), "image/png"))],
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "invalid_locale"
    assert body["supported"] == ["es", "ca", "eu", "en"]


def test_async_invalid_view_types_returns_400(client):
    """Invalid view_types label → HTTP 400 (sync parity)."""
    png = _make_png_bytes()
    response = client.post(
        "/classify/async",
        data={"view_types": "gills,not_a_view"},
        files=[
            ("images", ("a.png", io.BytesIO(png), "image/png")),
            ("images", ("b.png", io.BytesIO(png), "image/png")),
        ],
    )
    assert response.status_code == 400
    assert "not_a_view" in response.text.lower() or "invalid" in response.text.lower()


def test_async_locale_bcp47_accepted(client):
    """BCP-47 tags like ca-ES normalize and still enqueue the job."""
    png = _make_png_bytes()
    response = client.post(
        "/classify/async",
        data={"locale": "ca-ES"},
        files=[("images", ("a.png", io.BytesIO(png), "image/png"))],
    )
    assert response.status_code == 202, response.text


# --------------------------------------------------------------------------- #
# Worker forwards kwargs into classify_to_simple
# --------------------------------------------------------------------------- #
def test_run_classification_job_forwards_view_types_and_locale(
    tmp_path, monkeypatch
):
    """Worker passes view_types into classifier and echoes locale on simple."""
    raw = _make_raw_response(taxon="Boletus edulis", confidence=0.7)
    clf = _CapturingClassifier(raw)

    db_path = tmp_path / "job_form_parity.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr("app.services.task_queue.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        "app.services.task_queue.get_multi_view_classifier",
        lambda: clf,
    )

    db = TestingSessionLocal()
    try:
        obs = Observation(
            title="async form parity",
            organization_id="default",
            nearby_trees=[],
        )
        db.add(obs)
        db.commit()
        db.refresh(obs)

        for name in ("gills.png", "front.png"):
            img = ObservationImage(
                observation_id=obs.id,
                original_name=name,
                stored_name=f"stored_{name}",
                stored_path=str(tmp_path / name),
                size_bytes=100,
            )
            (tmp_path / name).write_bytes(_JPEG_MAGIC + b"test")
            db.add(img)
        db.commit()

        job = create_job(db, obs.id, organization_id="default")
        job_id = job.id
    finally:
        db.close()

    views = ["gills", "front"]
    run_classification_job(job_id, view_types=views, locale="eu")

    # Classifier received the form view labels
    assert clf.received_view_types == views

    db = TestingSessionLocal()
    try:
        from app.db.models import ClassificationJob

        job = db.get(ClassificationJob, job_id)
        assert job is not None
        assert job.status == "completed"
        assert job.result is not None
        simple = job.result["simple"]
        assert simple["locale"] == "eu"
        # Gate may block or allow depending on metrics; envelope shape must hold
        assert job.result["schema_version"] == 2
        assert "raw" in job.result
    finally:
        db.close()


def test_run_classification_job_defaults_locale_es_view_types_none(
    tmp_path, monkeypatch
):
    """Legacy call without kwargs keeps locale=es and view_types=None."""
    raw = _make_raw_response()
    clf = _CapturingClassifier(raw)

    db_path = tmp_path / "job_defaults.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr("app.services.task_queue.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        "app.services.task_queue.get_multi_view_classifier",
        lambda: clf,
    )

    db = TestingSessionLocal()
    try:
        obs = Observation(
            title="defaults",
            organization_id="default",
            nearby_trees=[],
        )
        db.add(obs)
        db.commit()
        db.refresh(obs)
        img = ObservationImage(
            observation_id=obs.id,
            original_name="x.jpg",
            stored_name="x_stored.jpg",
            stored_path=str(tmp_path / "x.jpg"),
            size_bytes=10,
        )
        (tmp_path / "x.jpg").write_bytes(_JPEG_MAGIC + b"x")
        db.add(img)
        db.commit()
        job = create_job(db, obs.id)
        job_id = job.id
    finally:
        db.close()

    run_classification_job(job_id)

    assert clf.received_view_types is None

    db = TestingSessionLocal()
    try:
        from app.db.models import ClassificationJob

        job = db.get(ClassificationJob, job_id)
        assert job.status == "completed"
        assert job.result["simple"]["locale"] == "es"
    finally:
        db.close()


def test_async_route_passes_form_kwargs_to_worker(client, monkeypatch):
    """Route enqueues run_classification_job with parsed view_types + locale."""
    captured: dict = {}

    def _fake_run(job_id: str, *, view_types=None, locale: str = "es") -> None:
        captured["job_id"] = job_id
        captured["view_types"] = view_types
        captured["locale"] = locale

    monkeypatch.setattr(
        "app.api.routes_jobs.run_classification_job",
        _fake_run,
    )

    png = _make_png_bytes()
    submit = client.post(
        "/classify/async",
        data={
            "locale": "en",
            "view_types": "front,habitat",
        },
        files=[
            ("images", ("front.png", io.BytesIO(png), "image/png")),
            ("images", ("habitat.png", io.BytesIO(png), "image/png")),
        ],
    )
    assert submit.status_code == 202, submit.text
    assert captured.get("job_id") == submit.json()["id"]
    assert captured.get("view_types") == ["front", "habitat"]
    assert captured.get("locale") == "en"
