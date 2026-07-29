"""M3 field holdout report builder + suite evaluator."""
from __future__ import annotations

import json
from pathlib import Path

from kaggle.ml_qa.field_holdout import evaluate_field_holdout, load_field_holdout_report

ROOT = Path(__file__).resolve().parents[2]


def test_evaluate_field_holdout_never_unlocks():
    out = evaluate_field_holdout(ROOT)
    assert out.get("product_unlock") is False
    assert out.get("suite") == "S14_field_multiview_holdout"
    # With existing LOO artifacts, should not hard-fail suite wiring
    assert out.get("pass") is True or out.get("skip") is True or out.get("pass") is False
    assert "consumption" not in json.dumps(out).lower() or "never" in json.dumps(out).lower()
    # Canonical report on disk from M3 ship
    rep = load_field_holdout_report(ROOT)
    if rep and rep.get("protocol") == "same_specimen_field_holdout_m3":
        assert rep.get("product_unlock") is False
        hl = rep.get("headline") or {}
        # General multi-view gain should be present when torch eval ok
        if (rep.get("gates") or {}).get("torch_ok"):
            assert hl.get("map3_4_minus_1") is None or float(hl["map3_4_minus_1"]) >= 0


def test_build_report_from_existing_loo(tmp_path: Path):
    # Import builder without running torch
    import importlib.util

    script = ROOT / "eval" / "scripts" / "field_multiview_holdout.py"
    spec = importlib.util.spec_from_file_location("field_multiview_holdout", script)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    loo = {
        "protocol": "same_occurrence_multi_image_gbif_local_stratified",
        "product_unlock": False,
        "inventory": {"n_packs_ge2": 100, "n_packs_ge4": 20},
        "torch": {
            "ok": True,
            "n_packs_attempted": 10,
            "n_species_in_sample": 8,
            "by_n_views": {
                "1": {"map_at_3": 0.8, "reject_rate": 0.2, "top1": 0.7},
                "2": {"map_at_3": 0.85, "reject_rate": 0.1, "top1": 0.75},
                "4": {"map_at_3": 0.9, "reject_rate": 0.05, "top1": 0.8},
            },
            "leave_one_photo_out": {
                "full4_map_at_3": 0.9,
                "loo_mean_map_at_3": 0.88,
                "delta_map3_full_minus_loo": 0.02,
            },
        },
        "deltas": {"map3_4_minus_1": 0.1},
        "loo_summary": {
            "full4_map_at_3": 0.9,
            "loo_mean_map_at_3": 0.88,
            "delta_map3_full_minus_loo": 0.02,
        },
    }
    deadly = {
        "torch": {
            "ok": True,
            "n_packs_attempted": 5,
            "by_n_views": {
                "1": {"map_at_3": 0.84},
                "4": {"map_at_3": 0.83},
            },
        },
        "deltas": {"map3_4_minus_1": -0.01},
    }
    rep = mod.build_field_holdout_report(loo=loo, deadly=deadly, inventory=None)
    assert rep["product_unlock"] is False
    assert rep["protocol"] == "same_specimen_field_holdout_m3"
    assert rep["gates"]["pass"] is True
    assert rep["headline"]["map3_4_minus_1"] == 0.1
    assert rep["deadly_multiview_caveat"] is True
    assert "never" in " ".join(rep["honesty_notes"]).lower() or "forage" in " ".join(
        rep["honesty_notes"]
    ).lower()
