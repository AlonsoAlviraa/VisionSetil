"""Status honesty for multi-view classifier load path (shipped get_status)."""

from __future__ import annotations

from pathlib import Path

from app.ml.model_registry import get_model_status
from app.services.multi_view_classifier import (
    MultiViewMushroomClassifier,
    reset_multi_view_classifier,
)


def test_get_status_never_claims_real_when_mock_fallback(tmp_path, monkeypatch):
    """Force no weights → must report mock_fallback, never real_*."""
    from app.core.config import settings

    monkeypatch.setattr(
        "app.ml.weight_discovery.resolve_multiview_weights_path",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.ml.weight_discovery.describe_weight_discovery",
        lambda **_kwargs: {
            "configured": str(tmp_path / "missing.pt"),
            "configured_exists": False,
            "resolved": None,
            "resolved_exists": False,
            "candidates": [],
            "candidate_count": 0,
        },
    )
    monkeypatch.setattr(settings, "multi_view_weights_path", tmp_path / "missing.pt")
    monkeypatch.setattr(settings, "model_fallback_to_mock", True)
    reset_multi_view_classifier()
    clf = MultiViewMushroomClassifier()
    st = clf.get_status()
    assert st["loaded"] is False
    assert st["backend"] == "mock_fallback"
    assert st["honesty"] == "mock_no_weights"
    assert "real" not in st["backend"]


def test_get_status_real_when_in_repo_weights_present():
    """If Kaggle best.pt is on disk, status may be real — but must be consistent."""
    reset_multi_view_classifier()
    clf = MultiViewMushroomClassifier()
    st = clf.get_status()
    assert "backend" in st
    assert "loaded" in st
    assert "honesty" in st
    if st["loaded"]:
        assert str(st["backend"]).startswith("real")
        assert st["honesty"] == "real_weights_loaded"
        assert st["num_classes"] > 0
        assert st.get("weights_discovered") is True
        assert not st.get("load_error")
    else:
        assert st["backend"] in ("mock_fallback", "error")
        assert st["honesty"] in (
            "mock_no_weights",
            "weights_found_but_mock_inference",
        )


def test_registry_status_includes_multiview():
    reset_multi_view_classifier()
    status = get_model_status()
    assert "multi_view_classifier" in status
    mv = status["multi_view_classifier"]
    assert isinstance(mv, dict)
    assert "backend" in mv or "error" in mv
