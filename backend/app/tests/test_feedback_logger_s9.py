"""S9-friendly classification log shape (v1.9.9). Never product_unlock."""
from __future__ import annotations

import json
from pathlib import Path

from app.services.feedback_logger import (
    FeedbackLogger,
    build_s9_log_entry,
    normalize_view_coverage,
    utc_iso_now,
)


def test_normalize_view_coverage_canonical_and_dedupe():
    assert normalize_view_coverage(["Gills", "front", "gills", "habitat"]) == [
        "gills",
        "front",
        "habitat",
    ]
    assert normalize_view_coverage("gills, front ; detail") == [
        "gills",
        "front",
        "detail",
    ]
    assert normalize_view_coverage(None) == []


def test_build_s9_log_entry_top_level_fields_never_unlock():
    entry = build_s9_log_entry(
        request_id="req-1",
        decision="rejected",
        predictions=[{"species": "X", "confidence": 0.2}],
        rejection_reason="high_entropy",
        open_set_reason="high_entropy",
        metadata={
            "mode": "real",
            "view_coverage": ["gills", "front"],
            "product_unlock": True,  # hostile — forced false
        },
        timestamp="2026-07-28T12:00:00+00:00",
    )
    assert entry["product_unlock"] is False
    assert entry["metadata"]["product_unlock"] is False
    assert entry["mode"] == "real"
    assert entry["view_coverage"] == ["gills", "front"]
    assert entry["n_views"] == 2
    assert entry["open_set_reason"] == "high_entropy"
    assert entry["policy"] == "orientation_only_never_consume"
    assert "+00:00" in entry["timestamp"] or entry["timestamp"].endswith("Z")
    assert "forage" not in json.dumps(entry).lower() or "never" in json.dumps(entry).lower()


def test_feedback_logger_writes_s9_shape(tmp_path: Path):
    log = tmp_path / "classification_log.jsonl"
    fl = FeedbackLogger(log_path=log)
    fl.log_classification(
        request_id="r2",
        image_path=None,
        image_bytes=b"abc",
        predictions=[{"species": "Amanita phalloides", "confidence": 0.4}],
        decision="accepted",
        rejection_reason=None,
        open_set_reason=None,
        metadata={"mode": "real", "view_types": ["gills", "front", "detail"]},
    )
    lines = [ln for ln in log.read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["product_unlock"] is False
    assert row["mode"] == "real"
    assert row["view_coverage"] == ["gills", "front", "detail"]
    assert row["n_views"] == 3
    assert row["image_hash"]
    # UTC ISO parseable for S9 windows
    assert "T" in row["timestamp"]


def test_utc_iso_now_has_offset():
    ts = utc_iso_now()
    assert "T" in ts
    assert "+" in ts or ts.endswith("Z")
