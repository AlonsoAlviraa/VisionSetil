"""Quality gate: dual signals (D-B15) + metrics path SSOT (D-B12).

B-20 golden suite: multi-metrics layouts under tmp_path — sibling miss,
industrial report-only, multiple kernels. Never assert best-MAP selection
for serve. metrics_path is always a full path when present (D-B23).
"""

from __future__ import annotations

import json
import os
import time
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


def _write_metrics(path: Path, *, map3: float, deadly: float, version: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "test_map_at_3": map3,
                "safety_recall_deadly": deadly,
                "version": version,
            }
        ),
        encoding="utf-8",
    )
    return path


def _assert_full_metrics_path(metrics_path: str | None, *, must_contain: str | None = None) -> None:
    """D-B23: metrics_path is never basename-only; full absolute/resolved path."""
    assert metrics_path is not None
    p = Path(metrics_path)
    assert p.name == "metrics.json"
    # More than one path component — not basename-only
    assert len(p.parts) > 1
    # Absolute (resolve() in _read_metrics_file) when filesystem allows
    assert p.is_absolute() or (os.name == "nt" and len(p.parts) > 1)
    if must_contain is not None:
        assert must_contain in metrics_path


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
    _write_metrics(high / "metrics.json", map3=0.99, deadly=1.0, version="high")
    (high / "best.pt").write_bytes(b"high")

    # Low-MAP kernel — this is the actually loaded checkpoint
    low = root / "kaggle" / "kernel_output_low" / "models"
    low.mkdir(parents=True)
    _write_metrics(low / "metrics.json", map3=0.05, deadly=0.0, version="low")
    low_weights = low / "best.pt"
    low_weights.write_bytes(b"low")

    # Configured path points at high (tempting) — loaded path is low
    monkeypatch.setattr(settings, "multi_view_weights_path", high / "best.pt")
    clear_metrics_cache()

    metrics = load_primary_metrics(str(root), loaded_weights_path=low_weights)
    assert metrics is not None
    assert metrics["test_map_at_3"] == pytest.approx(0.05)
    assert metrics["version"] == "low"
    _assert_full_metrics_path(metrics["_metrics_path"], must_contain="kernel_output_low")
    assert "kernel_output_high" not in metrics["_metrics_path"]

    gate = quality_gate_status(loaded_weights_path=low_weights, repo_root=str(root))
    assert gate["metrics_acceptable"] is False
    assert gate["species_id_allowed"] is False
    assert gate["verdict"] == "UNACCEPTABLE"
    assert gate["reason_code"] == "map_below"
    _assert_full_metrics_path(gate["metrics_path"], must_contain="kernel_output_low")


def test_weights_without_sibling_metrics_is_no_metrics(tmp_path):
    """D-B12 sibling miss: weights known but no metrics.json → no_metrics (no fallthrough)."""
    models = tmp_path / "models_only"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"weights-only")
    # Deliberately no metrics.json next to weights

    # Plant a tempting high-MAP metrics elsewhere (must not be used)
    other = tmp_path / "kaggle" / "kernel_output_other" / "models"
    _write_metrics(other / "metrics.json", map3=0.95, deadly=1.0, version="other")

    # Industrial report also present — still must not fall through for serve
    ind = tmp_path / "data" / "industrial_v1"
    _write_metrics(ind / "metrics.json", map3=0.88, deadly=0.99, version="industrial")

    metrics = load_primary_metrics(str(tmp_path), loaded_weights_path=weights)
    assert metrics is None

    gate = quality_gate_status(loaded_weights_path=weights, repo_root=str(tmp_path))
    assert gate["metrics_acceptable"] is False
    assert gate["species_id_allowed"] is False
    assert gate["reason_code"] == "no_metrics"
    assert gate["verdict"] == "UNACCEPTABLE"
    assert gate["test_map_at_3"] is None
    assert gate["metrics_path"] is None


def test_gates_passed_dual_signals(tmp_path):
    models = tmp_path / "models"
    models.mkdir()
    weights = models / "best.pt"
    weights.write_bytes(b"ok")
    _write_metrics(models / "metrics.json", map3=0.45, deadly=0.95, version="ok")
    gate = quality_gate_status(loaded_weights_path=weights)
    assert gate["metrics_acceptable"] is True
    assert gate["species_id_allowed"] is True
    assert gate["reason_code"] == "gates_passed"
    assert gate["verdict"] == "ACCEPTABLE"
    assert gate["block_enabled"] is True
    _assert_full_metrics_path(gate["metrics_path"])


def test_discovery_no_weights_picks_mtime_newest_not_max_map(monkeypatch, tmp_path):
    """D-B12 discovery-only: mtime-newest among kernels, never max-MAP."""
    root = tmp_path / "repo"
    # Older file with high MAP (must NOT win)
    old = root / "kaggle" / "kernel_output_old" / "models"
    old_metrics = _write_metrics(
        old / "metrics.json", map3=0.99, deadly=1.0, version="old-high"
    )
    # Newer file with low MAP (must win under mtime ranking)
    new = root / "kaggle" / "kernel_output_new" / "models"
    new_metrics = _write_metrics(
        new / "metrics.json", map3=0.05, deadly=0.0, version="new-low"
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
    _assert_full_metrics_path(metrics["_metrics_path"], must_contain="kernel_output_new")


# ── B-20 expanded multi-metrics golden layouts ──────────────────────────────


def test_golden_multiple_kernels_serve_ignores_higher_map(tmp_path):
    """B-20: three kernels; serve uses only sibling of loaded checkpoint."""
    root = tmp_path / "repo"
    layouts = [
        ("kernel_output_a", 0.12, "a"),
        ("kernel_output_b", 0.77, "b"),  # highest MAP — must NOT win for serve
        ("kernel_output_c", 0.03, "c"),  # actually loaded
    ]
    for name, map3, ver in layouts:
        models = root / "kaggle" / name / "models"
        models.mkdir(parents=True)
        _write_metrics(models / "metrics.json", map3=map3, deadly=0.0, version=ver)
        (models / "best.pt").write_bytes(ver.encode())

    loaded = root / "kaggle" / "kernel_output_c" / "models" / "best.pt"
    metrics = load_primary_metrics(str(root), loaded_weights_path=loaded)
    assert metrics is not None
    assert metrics["version"] == "c"
    assert metrics["test_map_at_3"] == pytest.approx(0.03)
    _assert_full_metrics_path(metrics["_metrics_path"], must_contain="kernel_output_c")
    assert "kernel_output_b" not in metrics["_metrics_path"]

    gate = quality_gate_status(loaded_weights_path=loaded, repo_root=str(root))
    assert gate["reason_code"] == "map_below"
    assert gate["metrics_acceptable"] is False
    _assert_full_metrics_path(gate["metrics_path"], must_contain="kernel_output_c")


def test_golden_sibling_miss_does_not_use_industrial(tmp_path):
    """B-20 sibling miss: industrial_v1 present must not backfill serve metrics."""
    root = tmp_path / "repo"
    serve_models = root / "kaggle" / "kernel_output_live" / "models"
    serve_models.mkdir(parents=True)
    weights = serve_models / "best.pt"
    weights.write_bytes(b"live")
    # No sibling metrics.json

    ind = root / "data" / "industrial_v1"
    _write_metrics(ind / "metrics.json", map3=0.91, deadly=0.97, version="ind-pass")

    high = root / "kaggle" / "kernel_output_high" / "models"
    _write_metrics(high / "metrics.json", map3=0.99, deadly=1.0, version="high")

    metrics = load_primary_metrics(str(root), loaded_weights_path=weights)
    assert metrics is None

    gate = quality_gate_status(loaded_weights_path=weights, repo_root=str(root))
    assert gate["reason_code"] == "no_metrics"
    assert gate["metrics_path"] is None
    assert gate["species_id_allowed"] is False


def test_golden_industrial_report_only_preferred_over_kernels(monkeypatch, tmp_path):
    """B-20: no serve weights → industrial_v1 preferred over kernel max-MAP."""
    root = tmp_path / "repo"
    ind = root / "data" / "industrial_v1"
    _write_metrics(ind / "metrics.json", map3=0.22, deadly=0.5, version="industrial")

    # Kernel with higher MAP and newer mtime — must lose to industrial when
    # industrial is in the ordered discovery list (before mtime kernel scan).
    kern = root / "kaggle" / "kernel_output_hot" / "models"
    km = _write_metrics(kern / "metrics.json", map3=0.99, deadly=1.0, version="hot")
    now = time.time()
    os.utime(km, (now + 100, now + 100))

    monkeypatch.setattr(
        settings, "multi_view_weights_path", root / "missing" / "best.pt"
    )
    monkeypatch.setattr(
        "app.ml.quality_gate._resolve_serve_weights_path",
        lambda loaded_weights_path=None: None,
    )
    clear_metrics_cache()

    metrics = load_primary_metrics(str(root))
    assert metrics is not None
    assert metrics["version"] == "industrial"
    assert metrics["test_map_at_3"] == pytest.approx(0.22)
    _assert_full_metrics_path(metrics["_metrics_path"], must_contain="industrial_v1")
    assert "kernel_output_hot" not in metrics["_metrics_path"]

    gate = quality_gate_status(repo_root=str(root))
    # industrial MAP 0.22 >= 0.20 but deadly 0.5 < 0.90
    assert gate["metrics_acceptable"] is False
    assert gate["reason_code"] == "deadly_below"
    _assert_full_metrics_path(gate["metrics_path"], must_contain="industrial_v1")


def test_golden_configured_sibling_preferred_in_discovery(monkeypatch, tmp_path):
    """B-20 discovery: configured multi_view_weights_path sibling beats industrial."""
    root = tmp_path / "repo"
    conf_models = root / "weights" / "configured" / "models"
    conf_models.mkdir(parents=True)
    conf_w = conf_models / "best.pt"
    # Configured path may point at missing weights file — sibling still preferred
    _write_metrics(
        conf_models / "metrics.json", map3=0.11, deadly=0.1, version="configured"
    )

    ind = root / "data" / "industrial_v1"
    _write_metrics(ind / "metrics.json", map3=0.99, deadly=1.0, version="industrial")

    monkeypatch.setattr(settings, "multi_view_weights_path", conf_w)
    monkeypatch.setattr(
        "app.ml.quality_gate._resolve_serve_weights_path",
        lambda loaded_weights_path=None: None,
    )
    clear_metrics_cache()

    metrics = load_primary_metrics(str(root))
    assert metrics is not None
    assert metrics["version"] == "configured"
    _assert_full_metrics_path(metrics["_metrics_path"], must_contain="configured")
    assert "industrial_v1" not in metrics["_metrics_path"]


def test_golden_metrics_path_never_basename_only(tmp_path):
    """D-B23: QualityGatePayload.metrics_path is full path when metrics exist."""
    models = tmp_path / "deep" / "nested" / "run" / "models"
    models.mkdir(parents=True)
    weights = models / "best.pt"
    weights.write_bytes(b"w")
    _write_metrics(models / "metrics.json", map3=0.3, deadly=0.95, version="nested")

    gate = quality_gate_status(loaded_weights_path=weights)
    _assert_full_metrics_path(gate["metrics_path"], must_contain="nested")
    # Must not equal bare filename
    assert gate["metrics_path"] != "metrics.json"
    # resolve() → absolute path
    assert Path(gate["metrics_path"]).is_absolute()


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
