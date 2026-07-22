"""B-43: GET /models/catalog-join + join report payload for ML dashboard tile."""

from __future__ import annotations

import json
from pathlib import Path

from app.ml.species_index_join import (
    ALIGN_PCT,
    catalog_join_payload,
    overlap_verdict,
)


def test_overlap_verdict_bands():
    assert overlap_verdict(None) == "UNKNOWN"
    assert overlap_verdict(ALIGN_PCT) == "ALIGNED"
    assert overlap_verdict(99.0) == "ALIGNED"
    assert overlap_verdict(50.0) == "PARTIAL"
    assert overlap_verdict(49.9) == "MISMATCH"
    assert overlap_verdict(0.0) == "MISMATCH"


def test_catalog_join_payload_missing_report(tmp_path: Path):
    payload = catalog_join_payload(repo_root=tmp_path)
    assert payload["available"] is False
    assert payload["coverage_pct"] is None
    assert payload["overlap_verdict"] == "UNKNOWN"
    assert payload["mismatch"] is None
    assert payload["hint"]
    assert "build_species_index_join" in payload["hint"]


def test_catalog_join_payload_from_fixture(tmp_path: Path):
    report_dir = tmp_path / "data" / "species_catalog"
    report_dir.mkdir(parents=True)
    report = {
        "timestamp": "2026-07-22T00:00:00+00:00",
        "cadence": "nightly_and_on_demand",
        "catalog_path": "data/species_catalog/species_catalog_v2.json",
        "catalog_version": "2.2.0",
        "catalog_count": 100,
        "label2idx_path": "kaggle/kernel_output_v9/models/label2idx.json",
        "label2idx_discovered": True,
        "selection_reason": "multi_view_configured_sibling",
        "model_count": 50,
        "intersection_count": 20,
        "coverage_pct": 40.0,
        "coverage_model_in_catalog_pct": 40.0,
        "coverage_catalog_in_model_pct": 20.0,
        "missing_in_catalog_count": 30,
        "missing_in_model_count": 80,
        "synonyms_applied_count": 0,
    }
    (report_dir / "species_index_join_report.json").write_text(
        json.dumps(report), encoding="utf-8"
    )

    payload = catalog_join_payload(repo_root=tmp_path)
    assert payload["available"] is True
    assert payload["coverage_pct"] == 40.0
    assert payload["coverage_model_in_catalog_pct"] == 40.0
    assert payload["coverage_catalog_in_model_pct"] == 20.0
    assert payload["intersection_count"] == 20
    assert payload["model_count"] == 50
    assert payload["catalog_count"] == 100
    assert payload["missing_in_catalog_count"] == 30
    assert payload["missing_in_model_count"] == 80
    assert payload["overlap_verdict"] == "MISMATCH"
    assert payload["mismatch"] is True
    assert payload["label2idx_discovered"] is True
    assert payload["catalog_version"] == "2.2.0"
    assert "species_index_join_report.json" in payload["report_path"]


def test_catalog_join_payload_aligned(tmp_path: Path):
    report_dir = tmp_path / "data" / "species_catalog"
    report_dir.mkdir(parents=True)
    (report_dir / "species_index_join_report.json").write_text(
        json.dumps(
            {
                "coverage_pct": 95.0,
                "coverage_model_in_catalog_pct": 95.0,
                "coverage_catalog_in_model_pct": 90.0,
                "intersection_count": 95,
                "model_count": 100,
                "catalog_count": 100,
                "missing_in_catalog_count": 5,
                "missing_in_model_count": 5,
                "label2idx_discovered": True,
            }
        ),
        encoding="utf-8",
    )
    payload = catalog_join_payload(repo_root=tmp_path)
    assert payload["available"] is True
    assert payload["overlap_verdict"] == "ALIGNED"
    assert payload["mismatch"] is False


def test_models_catalog_join_endpoint(client):
    """GET /models/catalog-join returns compact overlap payload (B-43)."""
    resp = client.get("/models/catalog-join")
    assert resp.status_code == 200
    body = resp.json()

    assert "available" in body
    assert "coverage_pct" in body
    assert "overlap_verdict" in body
    assert body["overlap_verdict"] in {
        "ALIGNED",
        "PARTIAL",
        "MISMATCH",
        "UNKNOWN",
    }

    # Committed baseline report should exist in monorepo CI/dev checkouts
    if body["available"]:
        assert isinstance(body["coverage_pct"], (int, float))
        assert body["mismatch"] is not None
        assert body["model_count"] is not None
        assert body["catalog_count"] is not None
        assert body["intersection_count"] is not None
        assert body["report_path"]
    else:
        assert body["hint"]
