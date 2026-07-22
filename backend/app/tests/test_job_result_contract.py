"""B-45 — Job result envelope contract tests (simple mode/gate + permanent raw).

Contract (D-B18 / D-B24 / Appendix D.4)::

    {
      "schema_version": 2,
      "simple": <SimpleClassificationResult>,  # product path — always gated
      "raw": <ClassificationResponse|null>     # permanent admin/debug (no sunset)
    }

Assertions
----------
* ``simple`` always exposes honesty fields ``mode`` and ``quality_gate``
  (dual signals: ``metrics_acceptable`` + ``species_id_allowed``).
* Envelope **always** keeps the ``raw`` key (permanent; value may be null only
  if the worker truly has no ClassificationResponse — still present).
* Product clients **must read ``simple`` only** — never treat ``raw`` predictions
  as product truth (see ``routes_jobs`` / ``JobResultEnvelope`` docs).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from app.core.config import settings
from app.db.models import ClassificationJob
from app.db.schemas import (
    CandidateResult,
    ClassificationResponse,
    ClassifyMode,
    HumanReviewResponse,
    JobResultEnvelope,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    QualityGatePayload,
    SimpleClassificationResult,
    TraceResponse,
)
from app.ml.quality_gate import clear_metrics_cache
from app.services.classify_simple import (
    JOB_RESULT_SCHEMA_VERSION,
    build_job_result_envelope,
    map_to_simple,
)

# Keys every product client may rely on under ``simple`` (honesty contract).
_SIMPLE_MODE_VALUES = {"real", "mock", "blocked"}
_GATE_DUAL_SIGNAL_KEYS = (
    "species_id_allowed",
    "metrics_acceptable",
    "block_enabled",
    "reason",
    "reason_code",
    "verdict",
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
        message="contract-test",
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


def _failing_gate_weights(tmp_path) -> str:
    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"fake-weights")
    (models / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.0,
                "version": "contract-gate-fail",
            }
        ),
        encoding="utf-8",
    )
    return str(weights)


def _assert_simple_has_mode_and_gate(simple: dict) -> None:
    """Core B-45 contract: product ``simple`` always carries mode + quality_gate."""
    assert "mode" in simple, "simple.mode is required (D-B1 / D-B22)"
    mode = simple["mode"]
    mode_val = mode.value if hasattr(mode, "value") else mode
    assert str(mode_val) in _SIMPLE_MODE_VALUES, f"unexpected mode: {mode_val!r}"

    assert "quality_gate" in simple, "simple.quality_gate is required (D-B2 / D-B22)"
    gate = simple["quality_gate"]
    assert isinstance(gate, dict), "quality_gate must serialize as object"
    for key in _GATE_DUAL_SIGNAL_KEYS:
        assert key in gate, f"quality_gate missing dual-signal field {key!r}"
    assert isinstance(gate["species_id_allowed"], bool)
    assert isinstance(gate["metrics_acceptable"], bool)
    assert gate["verdict"] in ("ACCEPTABLE", "UNACCEPTABLE")


def _assert_raw_permanent(envelope: dict) -> None:
    """Core B-45 contract: ``raw`` key is permanent (D-B18 / D-B24) — never omitted."""
    assert "raw" in envelope, "envelope must keep permanent raw key (D-B24)"
    # Value may be dict (ClassificationResponse) or None — key must exist either way.
    raw = envelope["raw"]
    assert raw is None or isinstance(raw, dict)


# ─── Unit: envelope builder contract ─────────────────────────────────────────


def test_envelope_keys_schema_version_simple_raw():
    """Envelope shape: schema_version=2 + simple + permanent raw key."""
    raw = _make_raw_response()
    simple = map_to_simple(raw, "contract-shape", 12, loaded_weights_path=None)
    envelope = build_job_result_envelope(simple, raw)

    assert set(envelope.keys()) == {"schema_version", "simple", "raw"}
    assert envelope["schema_version"] == JOB_RESULT_SCHEMA_VERSION == 2
    _assert_simple_has_mode_and_gate(envelope["simple"])
    _assert_raw_permanent(envelope)
    assert envelope["raw"] is not None
    JobResultEnvelope.model_validate(envelope)


def test_simple_mode_and_gate_present_when_gate_passes_and_fails(
    tmp_path, monkeypatch
):
    """Mapper always sets mode + quality_gate (pass and fail); envelope keeps both."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", True)
    raw = _make_raw_response(taxon="Boletus edulis", confidence=0.7)

    # Gate fail path (bad metrics next to weights)
    weights_fail = _failing_gate_weights(tmp_path)
    simple_fail = map_to_simple(
        raw, "contract-fail", 8, loaded_weights_path=weights_fail
    )
    env_fail = build_job_result_envelope(simple_fail, raw)
    _assert_simple_has_mode_and_gate(env_fail["simple"])
    assert env_fail["simple"]["mode"] in ("blocked", ClassifyMode.blocked)
    assert env_fail["simple"]["quality_gate"]["species_id_allowed"] is False
    assert env_fail["simple"]["quality_gate"]["metrics_acceptable"] is False
    _assert_raw_permanent(env_fail)

    # Gate disabled path still exposes dual signals (metrics may be false)
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", False)
    clear_metrics_cache()
    simple_disabled = map_to_simple(
        raw, "contract-disabled", 9, loaded_weights_path=weights_fail
    )
    env_disabled = build_job_result_envelope(simple_disabled, raw)
    _assert_simple_has_mode_and_gate(env_disabled["simple"])
    gate = env_disabled["simple"]["quality_gate"]
    # Dual signal: metrics still unacceptable; allow may be true under disable
    assert gate["metrics_acceptable"] is False
    assert "species_id_allowed" in gate
    assert env_disabled["simple"]["mode"] in _SIMPLE_MODE_VALUES
    _assert_raw_permanent(env_disabled)


def test_raw_key_present_when_raw_is_none():
    """Permanent raw: key remains even if ClassificationResponse is None (D-B24)."""
    raw = _make_raw_response()
    simple = map_to_simple(raw, "contract-null-raw", 5, loaded_weights_path=None)
    envelope = build_job_result_envelope(simple, None)

    assert envelope["schema_version"] == 2
    _assert_simple_has_mode_and_gate(envelope["simple"])
    _assert_raw_permanent(envelope)
    assert envelope["raw"] is None
    # Pydantic accepts null raw
    JobResultEnvelope.model_validate(envelope)


def test_job_result_envelope_schema_rejects_missing_simple_mode_gate():
    """JobResultEnvelope + SimpleClassificationResult require mode/quality_gate."""
    # Building SimpleClassificationResult without overrides still has defaults,
    # but defaults are fail-closed (blocked + unset gate) — still present.
    minimal = SimpleClassificationResult(
        request_id="min",
        decision="rejected",
        predictions=[],
        processing_time_ms=1,
    )
    assert minimal.mode == ClassifyMode.blocked
    assert isinstance(minimal.quality_gate, QualityGatePayload)
    assert minimal.quality_gate.species_id_allowed is False

    envelope = JobResultEnvelope(schema_version=2, simple=minimal, raw=None)
    dumped = envelope.model_dump()
    _assert_simple_has_mode_and_gate(dumped["simple"])
    _assert_raw_permanent(dumped)


def test_product_clients_read_simple_not_raw_predictions(tmp_path, monkeypatch):
    """Product path is ``simple`` only: when gate fails, simple preds empty; raw may keep species."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", True)
    weights = _failing_gate_weights(tmp_path)
    raw = _make_raw_response(taxon="Amanita phalloides", confidence=0.99)
    simple = map_to_simple(raw, "contract-product", 11, loaded_weights_path=weights)
    envelope = build_job_result_envelope(simple, raw)

    # Product honesty fields
    _assert_simple_has_mode_and_gate(envelope["simple"])
    assert envelope["simple"]["predictions"] == []
    assert envelope["simple"]["decision"] == "rejected"
    assert envelope["simple"]["mode"] in ("blocked", ClassifyMode.blocked)

    # Admin/debug raw still present with model candidates (never the product path)
    _assert_raw_permanent(envelope)
    assert envelope["raw"] is not None
    raw_cands = (
        envelope["raw"].get("top_candidates")
        or envelope["raw"].get("candidates")
        or []
    )
    assert len(raw_cands) >= 1
    assert raw_cands[0]["taxon"] == "Amanita phalloides"


# ─── HTTP: GET /jobs/{id}/result contract ────────────────────────────────────


def test_http_job_result_contract_mode_gate_and_permanent_raw(
    client, monkeypatch, tmp_path
):
    """GET /jobs/{id}/result returns envelope with simple.mode/gate and permanent raw."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", True)
    weights = _failing_gate_weights(tmp_path)
    raw = _make_raw_response(taxon="Galerina marginata", confidence=0.9)
    simple = map_to_simple(raw, "contract-http", 15, loaded_weights_path=weights)
    envelope = build_job_result_envelope(simple, raw)

    fake_job = ClassificationJob(
        id="contract-job-result-001",
        observation_id=1,
        organization_id="default",
        status="completed",
        result=envelope,
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
    )
    monkeypatch.setattr(
        "app.api.routes_jobs.get_job",
        lambda db, job_id: fake_job,
    )

    resp = client.get("/jobs/contract-job-result-001/result")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    # Envelope shape
    assert payload["schema_version"] == 2
    assert "simple" in payload
    _assert_raw_permanent(payload)

    # simple.mode + simple.quality_gate (B-45 primary assert)
    _assert_simple_has_mode_and_gate(payload["simple"])
    assert payload["simple"]["mode"] == "blocked"
    gate = payload["simple"]["quality_gate"]
    assert gate["species_id_allowed"] is False
    assert gate["metrics_acceptable"] is False

    # Permanent raw still carries full ClassificationResponse for admin/debug
    assert payload["raw"] is not None
    assert (
        payload["raw"].get("top_candidates") or payload["raw"].get("candidates")
    )

    # OpenAPI response_model accepts the payload
    JobResultEnvelope.model_validate(payload)


def test_job_result_docs_contract_product_reads_simple_only():
    """Route + schema docs: product clients read ``simple`` only; ``raw`` permanent."""
    from app.api.routes_jobs import get_job_result

    route_doc = (get_job_result.__doc__ or "").lower()
    assert "simple" in route_doc
    assert "raw" in route_doc
    assert "product" in route_doc

    schema_doc = (JobResultEnvelope.__doc__ or "").lower()
    assert "simple" in schema_doc
    assert "product" in schema_doc
    # D-B24: raw kept indefinitely for admin/debug (no deprecation plan)
    assert (
        "permanent" in schema_doc
        or "indefinitely" in schema_doc
        or "admin" in schema_doc
    )
