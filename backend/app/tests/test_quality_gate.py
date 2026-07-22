"""Quality gate: dual signals (D-B15) + metrics path SSOT (D-B12)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.config import settings
from app.ml.quality_gate import (
    apply_quality_gate_to_simple_result,
    clear_metrics_cache,
    load_primary_metrics,
    quality_gate_status,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_metrics_cache()
    yield
    clear_metrics_cache()


def test_quality_gate_blocks_current_v9_metrics():
    gate = quality_gate_status()
    # With v9 metrics on disk (MAP@3~0.076, deadly 0), gate must FAIL
    if gate.get("test_map_at_3") is not None and gate["test_map_at_3"] < 0.20:
        assert gate["species_id_allowed"] is False
        assert gate["metrics_acceptable"] is False
        assert gate["verdict"] == "UNACCEPTABLE"
        assert gate["reason_code"] in {"map_below", "deadly_below", "no_metrics"}


def test_apply_gate_clears_predictions():
    simple = {
        "decision": "accepted",
        "predictions": [{"species": "Amanita muscaria", "confidence": 0.4}],
        "warnings": [],
        "ml_notes": [],
        "final_warning": "",
        "recommend_human_review": False,
    }
    out = apply_quality_gate_to_simple_result(simple)
    gate = out.get("quality_gate") or {}
    # quality_gate always attached
    assert "species_id_allowed" in gate
    assert "metrics_acceptable" in gate
    assert "reason_code" in gate
    if not gate.get("species_id_allowed", True):
        assert out["decision"] == "rejected"
        assert out["predictions"] == []
        assert out["recommend_human_review"] is True
        assert "GATE" in (out["warnings"][0] if out["warnings"] else "")


def test_apply_gate_always_sets_quality_gate_on_pass(monkeypatch):
    """Pass path must also attach quality_gate (no strip)."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", False)
    clear_metrics_cache()
    simple = {
        "decision": "accepted",
        "predictions": [{"species": "Boletus edulis", "confidence": 0.5}],
        "warnings": [],
        "ml_notes": [],
        "final_warning": "",
        "recommend_human_review": False,
    }
    out = apply_quality_gate_to_simple_result(simple)
    assert "quality_gate" in out
    gate = out["quality_gate"]
    assert gate["species_id_allowed"] is True
    assert gate["block_enabled"] is False
    assert gate["reason_code"] == "gate_disabled"
    # Dual signal: metrics may still be unacceptable under disable
    assert "metrics_acceptable" in gate
    assert gate["verdict"] == (
        "ACCEPTABLE" if gate["metrics_acceptable"] else "UNACCEPTABLE"
    )


def test_dual_signal_disable_does_not_force_metrics_acceptable(monkeypatch, tmp_path):
    """D-B15: metrics_acceptable is raw MAP/deadly only — never forced by disable."""
    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"fake")
    (models / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.0,
                "version": "test-low",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", False)
    clear_metrics_cache()
    gate = quality_gate_status(loaded_weights_path=weights)
    assert gate["block_enabled"] is False
    assert gate["species_id_allowed"] is True
    assert gate["metrics_acceptable"] is False
    assert gate["verdict"] == "UNACCEPTABLE"
    assert gate["reason_code"] == "gate_disabled"
    assert gate["test_map_at_3"] == pytest.approx(0.05)


def test_metrics_ssot_sibling_not_max_map(monkeypatch, tmp_path):
    """D-B12: serve metrics = sibling of loaded weights; never max-MAP across kernels."""
    root = tmp_path / "repo"
    # High-MAP kernel (must NOT be selected when serving other weights)
    high = root / "kaggle" / "kernel_output_high" / "models"
    high.mkdir(parents=True)
    (high / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.99,
                "safety_recall_deadly": 1.0,
                "version": "high",
            }
        ),
        encoding="utf-8",
    )
    (high / "best.pt").write_bytes(b"high")

    # Low-MAP kernel — this is the actually loaded checkpoint
    low = root / "kaggle" / "kernel_output_low" / "models"
    low.mkdir(parents=True)
    (low / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.0,
                "version": "low",
            }
        ),
        encoding="utf-8",
    )
    low_weights = low / "best.pt"
    low_weights.write_bytes(b"low")

    # Configured path points at high (tempting) — loaded path is low
    monkeypatch.setattr(settings, "multi_view_weights_path", high / "best.pt")
    clear_metrics_cache()

    metrics = load_primary_metrics(str(root), loaded_weights_path=low_weights)
    assert metrics is not None
    assert metrics["test_map_at_3"] == pytest.approx(0.05)
    assert metrics["version"] == "low"
    assert "kernel_output_low" in metrics["_metrics_path"]
    assert "kernel_output_high" not in metrics["_metrics_path"]

    gate = quality_gate_status(loaded_weights_path=low_weights, repo_root=str(root))
    assert gate["metrics_acceptable"] is False
    assert gate["species_id_allowed"] is False
    assert gate["verdict"] == "UNACCEPTABLE"
    assert gate["reason_code"] == "map_below"
    assert gate["metrics_path"] is not None
    # Full path, not basename-only (D-B23)
    assert Path(gate["metrics_path"]).name == "metrics.json"
    assert len(Path(gate["metrics_path"]).parts) > 1


def test_weights_without_sibling_metrics_is_no_metrics(tmp_path):
    """D-B12: weights known but no sibling metrics.json → no_metrics (no fallthrough)."""
    models = tmp_path / "models_only"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"weights-only")
    # Deliberately no metrics.json next to weights

    # Plant a tempting high-MAP metrics elsewhere (must not be used)
    other = tmp_path / "kaggle" / "kernel_output_other" / "models"
    other.mkdir(parents=True)
    (other / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.95,
                "safety_recall_deadly": 1.0,
                "version": "other",
            }
        ),
        encoding="utf-8",
    )

    metrics = load_primary_metrics(str(tmp_path), loaded_weights_path=weights)
    assert metrics is None

    gate = quality_gate_status(loaded_weights_path=weights, repo_root=str(tmp_path))
    assert gate["metrics_acceptable"] is False
    assert gate["species_id_allowed"] is False
    assert gate["reason_code"] == "no_metrics"
    assert gate["verdict"] == "UNACCEPTABLE"
    assert gate["test_map_at_3"] is None


def test_gates_passed_dual_signals(tmp_path):
    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"ok")
    (models / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.45,
                "safety_recall_deadly": 0.95,
                "version": "ok",
            }
        ),
        encoding="utf-8",
    )
    gate = quality_gate_status(loaded_weights_path=weights)
    assert gate["metrics_acceptable"] is True
    assert gate["species_id_allowed"] is True
    assert gate["reason_code"] == "gates_passed"
    assert gate["verdict"] == "ACCEPTABLE"
    assert gate["block_enabled"] is True


def test_discovery_no_weights_picks_mtime_newest_not_max_map(monkeypatch, tmp_path):
    """D-B12 discovery-only: mtime-newest among kernels, never max-MAP."""
    import os
    import time

    root = tmp_path / "repo"
    # Older file with high MAP (must NOT win)
    old = root / "kaggle" / "kernel_output_old" / "models"
    old.mkdir(parents=True)
    old_metrics = old / "metrics.json"
    old_metrics.write_text(
        json.dumps(
            {
                "test_map_at_3": 0.99,
                "safety_recall_deadly": 1.0,
                "version": "old-high",
            }
        ),
        encoding="utf-8",
    )
    # Newer file with low MAP (must win under mtime ranking)
    new = root / "kaggle" / "kernel_output_new" / "models"
    new.mkdir(parents=True)
    new_metrics = new / "metrics.json"
    new_metrics.write_text(
        json.dumps(
            {
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.0,
                "version": "new-low",
            }
        ),
        encoding="utf-8",
    )
    # Force mtime order: old older, new newer
    now = time.time()
    os.utime(old_metrics, (now - 1000, now - 1000))
    os.utime(new_metrics, (now, now))

    # Point configured weights at a missing path so no conf-sibling short-circuit
    monkeypatch.setattr(
        settings, "multi_view_weights_path", root / "missing" / "best.pt"
    )
    # No weights file anywhere under root → discovery path
    monkeypatch.setattr(
        "app.ml.quality_gate._resolve_serve_weights_path",
        lambda loaded_weights_path=None: None,
    )
    clear_metrics_cache()

    metrics = load_primary_metrics(str(root))
    assert metrics is not None
    assert metrics["test_map_at_3"] == pytest.approx(0.05)
    assert metrics["version"] == "new-low"
    assert "kernel_output_new" in metrics["_metrics_path"]


def test_map_to_simple_retains_quality_gate_and_mode(monkeypatch, tmp_path):
    """Regression: _map_to_simple must not strip quality_gate; mode matches derive."""
    from app.api.routes_classify import _map_to_simple
    from app.db.schemas import (
        CandidateResult,
        ClassificationResponse,
        HumanReviewResponse,
        ModelStackResponse,
        OpenSetResponse,
        QualityAssessmentResponse,
        TraceResponse,
    )
    from app.ml.classify_mode import derive_classify_mode

    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"w")
    (models / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.05,
                "safety_recall_deadly": 0.0,
                "version": "map-test",
            }
        ),
        encoding="utf-8",
    )

    cand = CandidateResult(
        taxon="Amanita muscaria",
        rank="species",
        confidence=0.4,
        danger_notes=[],
        lookalikes=[],
        edibility_label="toxic",
    )
    resp = ClassificationResponse(
        observation_id=1,
        status="orientation_only",
        safety_level="unsafe_to_consume",
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

    class _FakeClf:
        is_real = False
        last_view_coverage: list = []
        last_ml_notes: list = []
        last_confidence_margin = None
        resolved_weights_path = str(weights)

    result = _map_to_simple(
        resp,
        "req-strip",
        12,
        classifier=_FakeClf(),
        loaded_weights_path=str(weights),
    )

    # Not the fail-closed schema default
    assert result.quality_gate is not None
    assert result.quality_gate.reason_code != "unset"
    assert result.quality_gate.reason != "unset_fail_closed"
    assert result.quality_gate.metrics_acceptable is False
    assert result.quality_gate.species_id_allowed is False
    assert result.quality_gate.verdict == "UNACCEPTABLE"

    expected_mode = derive_classify_mode(
        is_mock_stack=True,
        species_id_allowed=result.quality_gate.species_id_allowed,
    )
    assert result.mode == expected_mode
    assert result.is_mock_stack is True  # not overwritten from mode
    assert result.locale == "es"
    assert result.decision == "rejected"
    assert result.predictions == []


# ─── B-09: GET /models/quality-gate dual-signal contract ─────────────────────

# Required keys for stable QualityGatePayload (preflight / OpenAPI)
_QUALITY_GATE_REQUIRED_KEYS = {
    "species_id_allowed",
    "metrics_acceptable",
    "block_enabled",
    "reason",
    "reason_code",
    "test_map_at_3",
    "safety_recall_deadly",
    "min_map_at_3",
    "min_deadly_recall",
    "metrics_path",
    "version",
    "verdict",
}


def test_quality_gate_payload_matches_status():
    """quality_gate_payload validates the same dual-signal dict as status."""
    from app.db.schemas import QualityGatePayload
    from app.ml.quality_gate import REASON_CODES, quality_gate_payload

    status = quality_gate_status()
    payload = quality_gate_payload()
    assert isinstance(payload, QualityGatePayload)
    dumped = payload.model_dump()
    assert set(dumped.keys()) == _QUALITY_GATE_REQUIRED_KEYS
    assert dumped["species_id_allowed"] == status["species_id_allowed"]
    assert dumped["metrics_acceptable"] == status["metrics_acceptable"]
    assert dumped["reason_code"] == status["reason_code"]
    assert dumped["reason_code"] in REASON_CODES
    assert dumped["verdict"] == (
        "ACCEPTABLE" if dumped["metrics_acceptable"] else "UNACCEPTABLE"
    )


def test_models_quality_gate_endpoint_dual_signal_contract(client):
    """GET /models/quality-gate returns stable QualityGatePayload dual signals."""
    from app.db.schemas import QualityGatePayload
    from app.ml.quality_gate import REASON_CODES

    resp = client.get("/models/quality-gate")
    assert resp.status_code == 200
    body = resp.json()

    # Exact contract keys (response_model strips extras)
    assert set(body.keys()) == _QUALITY_GATE_REQUIRED_KEYS

    assert isinstance(body["species_id_allowed"], bool)
    assert isinstance(body["metrics_acceptable"], bool)
    assert isinstance(body["block_enabled"], bool)
    assert isinstance(body["reason"], str) and body["reason"]
    assert body["reason_code"] in REASON_CODES
    assert body["reason_code"] != "unset"
    assert body["verdict"] in {"ACCEPTABLE", "UNACCEPTABLE"}
    # D-B15: verdict tracks metrics only
    assert body["verdict"] == (
        "ACCEPTABLE" if body["metrics_acceptable"] else "UNACCEPTABLE"
    )
    assert isinstance(body["min_map_at_3"], (int, float))
    assert isinstance(body["min_deadly_recall"], (int, float))

    # Re-validate through schema (fail if shape drifts)
    QualityGatePayload(**body)

    # Policy consistency when block is enabled
    if body["block_enabled"]:
        assert body["species_id_allowed"] == body["metrics_acceptable"]
    else:
        assert body["species_id_allowed"] is True
        assert body["reason_code"] == "gate_disabled"


def test_models_quality_gate_endpoint_gate_disabled_dual_signal(client, monkeypatch):
    """Disable policy allows species ID but keeps metrics_acceptable honest."""
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", False)
    clear_metrics_cache()

    resp = client.get("/models/quality-gate")
    assert resp.status_code == 200
    body = resp.json()

    assert body["block_enabled"] is False
    assert body["species_id_allowed"] is True
    assert body["reason_code"] == "gate_disabled"
    assert "metrics_acceptable" in body
    # verdict still tracks raw metrics (not forced ACCEPTABLE by disable)
    assert body["verdict"] == (
        "ACCEPTABLE" if body["metrics_acceptable"] else "UNACCEPTABLE"
    )


def test_models_quality_gate_endpoint_no_gpu_keys(client):
    """Endpoint must stay light: dual-signal fields only, no heavy stack dump."""
    resp = client.get("/models/quality-gate")
    assert resp.status_code == 200
    body = resp.json()
    # Must not leak /models/status-style bulk fields
    for forbidden in (
        "weight_discovery",
        "training_metrics",
        "multi_view_classifier",
        "detector",
        "summary",
        "config",
    ):
        assert forbidden not in body
    assert set(body.keys()) == _QUALITY_GATE_REQUIRED_KEYS


# ─── B-10: GET /readyz nested quality_gate + weights_present ──────────────────


def test_readyz_includes_nested_quality_gate_dual_and_weights_present(client):
    """/readyz exposes nested dual-signal quality_gate + weights_present (B-10)."""
    from app.db.schemas import QualityGatePayload
    from app.ml.quality_gate import REASON_CODES

    resp = client.get("/readyz")
    assert resp.status_code in (200, 503)
    body = resp.json()

    assert "ready" in body
    assert "weights_present" in body
    assert isinstance(body["weights_present"], bool)

    assert "quality_gate" in body
    gate = body["quality_gate"]
    assert isinstance(gate, dict)
    assert set(gate.keys()) == _QUALITY_GATE_REQUIRED_KEYS

    assert isinstance(gate["species_id_allowed"], bool)
    assert isinstance(gate["metrics_acceptable"], bool)
    assert isinstance(gate["block_enabled"], bool)
    assert gate["reason_code"] in REASON_CODES
    assert gate["reason_code"] != "unset"
    assert gate["verdict"] in {"ACCEPTABLE", "UNACCEPTABLE"}
    assert gate["verdict"] == (
        "ACCEPTABLE" if gate["metrics_acceptable"] else "UNACCEPTABLE"
    )
    # Nested payload validates as QualityGatePayload
    QualityGatePayload(**gate)


def test_readyz_quality_gate_matches_models_quality_gate_endpoint(client):
    """Nested /readyz quality_gate matches GET /models/quality-gate dual payload."""
    from app.ml.quality_gate import clear_metrics_cache

    clear_metrics_cache()
    r_ready = client.get("/readyz")
    r_gate = client.get("/models/quality-gate")
    assert r_ready.status_code in (200, 503)
    assert r_gate.status_code == 200

    nested = r_ready.json()["quality_gate"]
    endpoint = r_gate.json()
    for key in _QUALITY_GATE_REQUIRED_KEYS:
        assert nested[key] == endpoint[key], f"mismatch on {key}"


def test_readyz_gate_fail_does_not_force_unready(client, monkeypatch, tmp_path):
    """B-10: quality gate UNACCEPTABLE must not flip ready→false / HTTP 503.

    Only DB/models (and optional readyz_fail_on_mock_models) affect readiness.
    """
    # Force a failing gate via low sibling metrics under explicit weights
    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"low")
    (models / "metrics.json").write_text(
        json.dumps(
            {
                "test_map_at_3": 0.01,
                "safety_recall_deadly": 0.0,
                "version": "readyz-low",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "multi_view_weights_path", weights)
    monkeypatch.setattr(settings, "model_block_species_id_when_below_gate", True)
    # Do NOT fail readiness on mock models for this assertion
    monkeypatch.setattr(settings, "readyz_fail_on_mock_models", False)
    clear_metrics_cache()

    # Patch serve resolution so gate sees the low metrics
    monkeypatch.setattr(
        "app.ml.quality_gate._resolve_serve_weights_path",
        lambda loaded_weights_path=None: weights,
    )
    # weights_present can still use real discovery; force True for this fixture
    monkeypatch.setattr(
        "app.api.routes_health._weights_present",
        lambda: True,
    )

    resp = client.get("/readyz")
    body = resp.json()
    gate = body["quality_gate"]

    assert gate["metrics_acceptable"] is False
    assert gate["species_id_allowed"] is False
    assert gate["verdict"] == "UNACCEPTABLE"
    assert gate["reason_code"] in {"map_below", "deadly_below", "no_metrics"}

    # Gate fail must not be the reason for 503 when DB is ok
    assert body["ready"] is True
    assert resp.status_code == 200
    assert body["weights_present"] is True


def test_readyz_weights_present_false_when_no_checkpoint(client, monkeypatch, tmp_path):
    """weights_present is False when no multi-view checkpoint is on disk."""
    monkeypatch.setattr(
        settings, "multi_view_weights_path", tmp_path / "missing" / "best.pt"
    )
    monkeypatch.setattr(
        "app.ml.weight_discovery.resolve_multiview_weights_path",
        lambda **kwargs: None,
    )
    clear_metrics_cache()

    resp = client.get("/readyz")
    assert resp.status_code in (200, 503)
    body = resp.json()
    assert body["weights_present"] is False
    # Still always has nested dual gate
    assert set(body["quality_gate"].keys()) == _QUALITY_GATE_REQUIRED_KEYS


def test_readyz_fail_on_mock_still_controls_ready(client, monkeypatch):
    """readyz_fail_on_mock_models remains the only mock-related ready flip (not gate)."""
    monkeypatch.setattr(settings, "readyz_fail_on_mock_models", True)
    clear_metrics_cache()

    # Force mock stack reporting
    monkeypatch.setattr(
        "app.ml.model_registry.get_model_status",
        lambda: {"multi_view_classifier": {"backend": "mock", "loaded": True}},
    )

    resp = client.get("/readyz")
    body = resp.json()
    # When all mock + fail_on_mock: models degraded → unready
    assert body.get("classifier_mode") == "mock" or "mock" in str(
        body.get("checks", {})
    )
    assert body["ready"] is False
    assert resp.status_code == 503
    # Gate still nested even when unready
    assert "quality_gate" in body
    assert "weights_present" in body
