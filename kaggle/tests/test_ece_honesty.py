"""M2 ECE residual honesty — never unlocks."""
from __future__ import annotations

import json
from pathlib import Path

from kaggle.ml_qa.ece_honesty import (
    build_ece_residual_from_metrics,
    build_ece_residual_report,
    classify_ece_band,
    ece_product_guidance,
    write_ece_residual_report,
)

ROOT = Path(__file__).resolve().parents[2]


def test_classify_bands():
    assert classify_ece_band(0.02) == "good"
    assert classify_ece_band(0.08) == "moderate"
    assert classify_ece_band(0.1878) == "high"
    assert classify_ece_band(None) == "unknown"


def test_e20_metrics_high_residual_never_unlocks():
    metrics_path = ROOT / "kaggle" / "kernel_output_v20" / "models" / "metrics.json"
    assert metrics_path.is_file()
    report = build_ece_residual_report(metrics_path)
    assert report["product_unlock"] is False
    assert report["can_auto_unlock"] is False
    assert report["forage_permission"] is False
    assert report["consumption_permission"] is False
    assert report["status"] == "ok"
    assert report["band"] == "high"
    assert float(report["test_ece"]) > 0.12
    g = report["guidance"]
    assert g["deemphasize_confidence"] is True
    assert g["show_confidence"] is False
    assert "never" in g["summary_en"].lower() or "consumption" in g["summary_en"].lower()
    assert report["residual_actions"]
    assert all("unlock" not in a.lower() or "false" in a.lower() or "keep" in a.lower() for a in report["residual_actions"])


def test_write_report(tmp_path):
    rep = write_ece_residual_report(ROOT, out_dir=tmp_path)
    assert rep["product_unlock"] is False
    path = tmp_path / "e20_ece_residual.json"
    assert path.is_file()
    blob = json.loads(path.read_text(encoding="utf-8"))
    assert blob["product_unlock"] is False
    assert blob["band"] in ("good", "moderate", "high", "unknown")


def test_missing_metrics_unknown():
    out = build_ece_residual_from_metrics({}, source="empty")
    assert out["band"] == "unknown"
    assert out["product_unlock"] is False
    g = ece_product_guidance("unknown")
    assert g["show_confidence"] is False
