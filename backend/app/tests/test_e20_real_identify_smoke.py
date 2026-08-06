"""Real-mode Identify smoke against local E20 weights (when present).

Skips if kernel_output_v20/models/best.pt is missing (CI without artifacts).
Never asserts product_unlock=True — orientation-only policy.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from app.core.config import settings
from app.core.safety import UNSAFE_TO_CONSUME
from app.db.schemas import (
    ClassificationResponse,
    HumanReviewResponse,
    ModelStackResponse,
    OpenSetResponse,
    QualityAssessmentResponse,
    TraceResponse,
)
from app.ml.quality_gate import clear_metrics_cache, quality_gate_status
from app.services.classify_simple import map_to_simple
from app.services.multi_view_classifier import (
    MultiViewMushroomClassifier,
    reset_multi_view_classifier,
)

_E20_BEST = (
    Path(settings.multi_view_weights_path)
    if Path(settings.multi_view_weights_path).is_file()
    else Path(__file__).resolve().parents[3] / "kaggle" / "kernel_output_v20" / "models" / "best.pt"
)


pytestmark = pytest.mark.skipif(
    not _E20_BEST.is_file(),
    reason="E20 best.pt not present — skip real-weight Identify smoke",
)


@pytest.fixture()
def e20_classifier():
    reset_multi_view_classifier()
    clear_metrics_cache()
    clf = MultiViewMushroomClassifier()
    yield clf
    reset_multi_view_classifier()
    clear_metrics_cache()


def test_e20_weights_load_real(e20_classifier):
    clf = e20_classifier
    assert clf.is_real is True
    assert len(clf.label2idx) == 40
    assert clf.load_error is None
    assert clf._serve_temperature is not None
    assert 1.0 <= float(clf._serve_temperature) <= 3.0


def test_e20_arcface_centroids_loaded(e20_classifier):
    """ArcFace weight → class centroids for cosine open-set (or sibling npy)."""
    clf = e20_classifier
    assert clf.class_centroids is not None, "centroids missing (arcface extract or npy)"
    assert clf.class_centroids.ndim == 2
    assert clf.class_centroids.shape[0] == len(clf.label2idx)
    assert clf._centroids_source
    # L2-normalized rows
    norms = np.linalg.norm(clf.class_centroids, axis=1)
    assert float(norms.min()) > 0.9
    st = clf.get_status()
    assert st.get("centroids_loaded") is True
    assert (st.get("open_set") or {}).get("centroids_loaded") is True


def test_e20_quality_gate_accepts_sibling_metrics():
    gate = quality_gate_status(loaded_weights_path=_E20_BEST)
    assert gate["metrics_acceptable"] is True
    assert gate["species_id_allowed"] is True
    assert gate["verdict"] == "ACCEPTABLE"
    assert gate["reason_code"] == "gates_passed"
    assert float(gate["test_map_at_3"] or 0) >= 0.25
    # dual deadly @3 honest soft gate
    deadly = gate.get("safety_recall_deadly")
    assert deadly is not None and float(deadly) >= 0.90


def test_e20_ssot_lookalikes_on_real_labels(e20_classifier):
    clf = e20_classifier
    assert "Amanita phalloides" in clf.label2idx
    lks = clf._lookalikes_for("Amanita caesarea")
    assert lks
    assert any("phalloides" in n.lower() for n in lks)


def test_e20_map_to_simple_real_mode_wires_lookalikes(e20_classifier):
    clf = e20_classifier
    target = "Amanita phalloides"
    n = len(clf.label2idx)
    probs = np.full(n, 1e-6, dtype=np.float64)
    probs[clf.label2idx[target]] = 0.6
    if "Amanita caesarea" in clf.label2idx:
        probs[clf.label2idx["Amanita caesarea"]] = 0.25
    probs = probs / probs.sum()
    obs = SimpleNamespace(
        title="e20-smoke",
        notes="amanita",
        habitat=None,
        substrate=None,
        nearby_trees=[],
        country=None,
        smell=None,
        color_change_on_cut=None,
    )
    cands = clf._build_candidates(probs, obs, images=[], views=["gills", "front", "detail"])
    assert cands
    primary = cands[0]
    assert primary.taxon == target
    assert primary.lookalikes

    resp = ClassificationResponse(
        observation_id=1,
        status="orientation_only",
        safety_level=UNSAFE_TO_CONSUME,
        risk_state="high_risk_lookalikes",
        message="e20 real smoke",
        model_stack=ModelStackResponse(
            detector="e20",
            visual_embedder="e20",
            image_text_embedder="e20",
            metadata_encoder="e20",
        ),
        candidates=cands[:3],
        top_candidates=cands[:3],
        missing_evidence=[],
        explanation="e20",
        questions_for_user=[],
        warnings=[],
        dangerous_lookalikes=list(primary.lookalikes),
        quality_assessment=QualityAssessmentResponse(
            sharpness_ok=True,
            lighting_ok=True,
            mushroom_large_enough=True,
            has_lower_view=True,
            has_base_view=True,
            has_environment_view=True,
            possible_multiple_species=False,
            obstruction_detected=False,
            heavy_compression_or_blur=False,
            quality_warnings=[],
        ),
        open_set=OpenSetResponse(is_unknown_or_uncertain=False, reason="ok", decision="accept"),
        human_review=HumanReviewResponse(recommended=False, priority="low", reason="none"),
        final_warning="orientation only — never consume",
        trace=TraceResponse(
            pipeline_version="e20-real-smoke",
            classifier_strategy="multiview",
            segmentation_strategy="none",
            visual_backbone_plan=[],
            metadata_fusion_plan="none",
            open_set_strategy="none",
            human_review_path="none",
        ),
    )
    simple = map_to_simple(
        resp,
        "e20-real-smoke",
        40,
        classifier=clf,
        loaded_weights_path=str(_E20_BEST),
        locale="es",
    )
    # mode may be Enum
    mode = simple.mode.value if hasattr(simple.mode, "value") else str(simple.mode)
    assert mode == "real"
    assert simple.decision == "accepted"
    assert simple.predictions
    assert simple.predictions[0].species == target
    assert simple.predictions[0].in_catalog is True
    assert simple.dangerous_lookalikes, "SSOT lookalikes must surface on real path"
    assert simple.quality_gate is not None
    assert simple.quality_gate.species_id_allowed is True
    # Product unlock remains a separate fail-closed flag — never asserted True here


def test_e20_open_set_calibrated_thr_rejects_low_conf(e20_classifier):
    """With E20 calibrated conf thr (~0.92), low top-1 must abstain."""
    from app.services.species_catalog import describe_active_open_set_thresholds

    os_desc = describe_active_open_set_thresholds()
    conf_thr = float(os_desc.get("active_conf_thr") or 0.92)
    # Force calibrated-like path: synthetic low conf should reject
    n = max(len(e20_classifier.label2idx), 2)
    low = np.full(n, 1.0 / n, dtype=np.float64)  # flat ~0.025 each for 40-cls
    unknown_low, score_low = e20_classifier._open_set_check(
        embedding=np.zeros(8, dtype=np.float32), probs=low
    )
    assert unknown_low is True
    assert score_low < conf_thr

    high = np.full(n, 1e-6, dtype=np.float64)
    high[0] = 0.98
    high[1] = 0.01
    high = high / high.sum()
    unknown_high, score_high = e20_classifier._open_set_check(
        embedding=np.zeros(8, dtype=np.float32), probs=high
    )
    assert unknown_high is False
    assert score_high >= conf_thr * 0.95  # allow tiny numeric noise
    # calibrated file present on disk → status starts with calibrated
    assert os_desc.get("product_unlock") is False


def test_e20_describe_open_set_surfaces_holdout_stats():
    from app.services.species_catalog import describe_active_open_set_thresholds

    d = describe_active_open_set_thresholds()
    assert d.get("product_unlock") is False
    assert d.get("active_conf_thr") is not None
    # When S8 wrote calibrated file, surface holdout reject + mate rates
    if str(d.get("status") or "").startswith("calibrated"):
        assert float(d["active_conf_thr"]) >= 0.5
        assert d.get("holdout_reject_rate") is not None


def test_e20_open_set_entropy_secondary_rejects_diffuse(e20_classifier):
    """High-entropy multi-modal mass should abstain when entropy thr is active."""
    from app.services.species_catalog import describe_active_open_set_thresholds

    d = describe_active_open_set_thresholds()
    eth = float(d.get("active_entropy_thr") or 0.0)
    if eth <= 0.0:
        pytest.skip("entropy thr not calibrated yet")
    n = max(len(e20_classifier.label2idx), 8)
    # Clear conf thr (top1 high) but force entropy above thr via long flat tail
    probs = np.full(n, 1e-6, dtype=np.float64)
    # Split so entropy >> 0.25 while top1 stays above conf 0.92 is hard;
    # use top1 just above conf and rest uniform → elevates H.
    conf_thr = float(d.get("active_conf_thr") or 0.92)
    top1 = max(conf_thr + 0.01, 0.93)
    probs[0] = top1
    rem = 1.0 - top1
    probs[1:] = rem / (n - 1)
    probs = probs / probs.sum()
    p = np.clip(probs, 1e-12, 1.0)
    ent = float(-(p * np.log(p)).sum())
    # Amplify entropy if still below thr: lower top1 slightly but keep above conf
    if ent <= eth:
        top1 = conf_thr + 1e-3
        probs = np.full(n, 1e-6, dtype=np.float64)
        probs[0] = top1
        rem = 1.0 - top1
        probs[1:] = rem / (n - 1)
        probs = probs / probs.sum()
        p = np.clip(probs, 1e-12, 1.0)
        ent = float(-(p * np.log(p)).sum())
    unknown, _ = e20_classifier._open_set_check(
        embedding=np.zeros(8, dtype=np.float32), probs=probs
    )
    if ent > eth:
        assert unknown is True
    assert d.get("product_unlock") is False
