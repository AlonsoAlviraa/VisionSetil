"""Unit tests for scripts/build_species_index_join.py (B-39 / D-B25)."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "build_species_index_join.py"


def _load_join_module():
    spec = importlib.util.spec_from_file_location(
        "build_species_index_join", SCRIPT
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


join = _load_join_module()


def _write_json(path: Path, data: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_synonym_does_not_collapse_distinct_catalog_taxa():
    """Lactarius sanguifluus stays distinct from L. deliciosus when both in catalog."""
    reverse = {
        "lactarius deliciosus": "Lactarius deliciosus",
        "lactarius sanguifluus": "Lactarius deliciosus",
        "galerina autumnalis": "Galerina marginata",
        "galerina marginata": "Galerina marginata",
    }
    catalog = [
        "Lactarius deliciosus",
        "Lactarius sanguifluus",
        "Galerina marginata",
    ]
    model = [
        "Lactarius deliciosus",
        "Lactarius sanguifluus",
        "Galerina autumnalis",
        "Unknown sp",
    ]
    joined = join.join_taxa(catalog, model, reverse)

    assert len(joined["cat_keys"]) == 3
    assert "lactarius sanguifluus" in joined["cat_keys"]
    assert "lactarius deliciosus" in joined["cat_keys"]
    # both model labels match their own catalog taxa (not collapsed)
    assert joined["intersection_count"] == 3  # deliciosus, sanguifluus, marginata via alias
    assert any(
        s["alias"] == "lactarius sanguifluus" for s in joined["synonym_collisions_skipped"]
    )
    assert any(s["from"] == "Galerina autumnalis" for s in joined["synonyms_applied"])
    assert "Unknown sp" in joined["missing_in_catalog"]


def test_pick_and_load_falls_back_when_preferred_unreadable(tmp_path: Path):
    bad = tmp_path / "kernel_a" / "label2idx.json"
    bad.parent.mkdir(parents=True)
    bad.write_text("{not-json", encoding="utf-8")
    good = _write_json(
        tmp_path / "kernel_b" / "label2idx.json",
        {"Amanita muscaria": 0, "Boletus edulis": 1},
    )
    multi = tmp_path / "kernel_a" / "best.pt"  # sibling of bad
    ranked = join.rank_label2idx_candidates(
        [bad, good],
        multi_view_path=multi,
        resolved_weights=None,
        explicit=None,
    )
    # configured sibling (bad) ranks first
    assert ranked[0][0] == bad
    assert ranked[0][1] == "multi_view_configured_sibling"

    path, data, reason, err, errors = join.pick_and_load_label2idx(ranked)
    assert path == good
    assert data == {"Amanita muscaria": 0, "Boletus edulis": 1}
    assert reason == "max_class_count"
    assert err is None
    assert errors  # recorded skip of bad


def test_rank_prefers_explicit_then_multi_view_sibling(tmp_path: Path):
    sib = _write_json(
        tmp_path / "v9" / "label2idx.json",
        {f"sp{i}": i for i in range(5)},
    )
    big = _write_json(
        tmp_path / "v12" / "label2idx.json",
        {f"sp{i}": i for i in range(50)},
    )
    multi = tmp_path / "v9" / "best.pt"
    explicit = _write_json(tmp_path / "custom" / "label2idx.json", {"Only": 0})

    ranked = join.rank_label2idx_candidates(
        [sib, big],
        multi_view_path=multi,
        resolved_weights=None,
        explicit=explicit,
    )
    assert ranked[0] == (explicit, "explicit")
    assert ranked[1][0] == sib
    assert ranked[1][1] == "multi_view_configured_sibling"
    # largest among remainder
    assert any(p == big and r == "max_class_count" for p, r in ranked)


def test_main_exit_0_partial_coverage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    cat = {
        "catalog_version": "test",
        "count": 2,
        "species": [
            {"scientific_name": "Amanita muscaria"},
            {"scientific_name": "Boletus edulis"},
        ],
    }
    catalog_path = _write_json(tmp_path / "catalog.json", cat)
    l2i = _write_json(
        tmp_path / "models" / "label2idx.json",
        {"Amanita muscaria": 0, "Not In Catalog": 1},
    )
    out = tmp_path / "report.json"
    code = join.main(
        [
            "--catalog",
            str(catalog_path),
            "--label2idx",
            str(l2i),
            "--synonyms",
            str(tmp_path / "missing_synonyms.yaml"),
            "--multi-view-weights",
            str(tmp_path / "models" / "best.pt"),
            "--out",
            str(out),
        ]
    )
    assert code == 0
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["coverage_pct"] == 50.0
    assert report["model_count"] == 2
    assert report["catalog_count"] == 2
    assert report["selection_reason"] == "explicit"
    assert report["label2idx_discovered"] is True
    assert "Not In Catalog" in report["missing_in_catalog"]
    assert "Boletus edulis" in report["missing_in_model"]
    assert "selection_reason" in report
    assert "model_count_raw" in report
    assert "multi_view_weights_exists" in report


def test_main_exit_1_missing_catalog(tmp_path: Path):
    code = join.main(
        [
            "--catalog",
            str(tmp_path / "nope.json"),
            "--out",
            str(tmp_path / "out.json"),
        ]
    )
    assert code == 1


def test_build_report_schema_fields(tmp_path: Path):
    cat = {
        "catalog_version": "2.x",
        "count": 1,
        "species": [{"scientific_name": "Amanita muscaria"}],
    }
    report = join.build_report(
        catalog_path=tmp_path / "c.json",
        catalog=cat,
        catalog_names=["Amanita muscaria"],
        label2idx_path=tmp_path / "l.json",
        label2idx={"Amanita muscaria": 0},
        reverse={},
        candidates=[],
        multi_view_path=tmp_path / "best.pt",
        resolved_weights=None,
        selection_reason="explicit",
        label2idx_load_error=None,
    )
    for key in (
        "timestamp",
        "coverage_pct",
        "missing_in_catalog",
        "missing_in_model",
        "selection_reason",
        "model_count_raw",
        "multi_view_weights_exists",
        "synonym_collisions_skipped",
        "synonym_policy",
        "cadence",
    ):
        assert key in report
