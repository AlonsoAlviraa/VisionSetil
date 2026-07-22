"""Training metrics discovery + honesty (reads disk artifacts only)."""

from __future__ import annotations

from pathlib import Path

from app.ml.training_metrics import describe_training_metrics, discover_metrics_artifacts


def test_discover_finds_v9_metrics_when_present():
    root = Path(__file__).resolve().parents[3]
    arts = discover_metrics_artifacts(root)
    v9 = root / "kaggle" / "kernel_output_v9" / "models" / "metrics.json"
    if v9.is_file():
        assert any(a.get("run") == "kernel_output_v9" for a in arts)
        primary = describe_training_metrics(root)
        assert primary["honesty"] == "metrics_from_disk"
        m = (primary.get("primary") or {}).get("metrics") or {}
        assert "test_map_at_3" in m
        assert m.get("num_classes") == 500
    else:
        assert isinstance(arts, list)


def test_sources_registry_embedded():
    root = Path(__file__).resolve().parents[3]
    info = describe_training_metrics(root)
    reg_path = root / "data" / "training_sources_registry.json"
    if reg_path.is_file():
        assert info.get("sources_registry") is not None
        ids = info["sources_registry"].get("request_collaboration_ids") or []
        assert "micodata_micocyl_cyl" in ids or "montes_de_soria" in ids
