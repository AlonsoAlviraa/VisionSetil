"""Pure unit tests for E20c post-train suite + baseline compare honesty rails.

Covers: dual ECE primary provenance (no SSOT key synthesis), MO+iNat GAP,
product_unlock forced false, no invented metrics when files missing.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.loop_ml_compare_to_baseline import compare
from scripts.loop_ml_post_train_suite import (
    is_mo_inat_source,
    resolve_ece_primary,
    run_suite,
    runtime_train_domain_label,
)


def test_resolve_ece_primary_kernel_path_does_not_synthesize_ssot_key():
    """S1: claim train_published via primary_source; test_ece_train_published stays null."""
    m = {"test_ece": 0.18942074356203395, "temperature": 1.57}
    ece = resolve_ece_primary(m, from_kernel_train_publish=True)
    assert ece["claim_train_published"] is True
    assert ece["primary"] == "train_published"
    assert ece["primary_source"] == "kernel_metrics_test_ece_as_train_published"
    assert ece["primary_value"] == pytest.approx(0.18942074356203395)
    assert ece["test_ece"] == pytest.approx(0.18942074356203395)
    assert ece["test_ece_train_published"] is None  # never backfilled
    assert ece["posthoc_value"] is None


def test_resolve_ece_primary_explicit_train_published_key():
    m = {
        "test_ece": 0.19,
        "test_ece_train_published": 0.18741017924867615,
        "test_ece_posthoc": 0.045,
    }
    ece = resolve_ece_primary(m, from_kernel_train_publish=False)
    assert ece["claim_train_published"] is True
    assert ece["primary_source"] == "test_ece_train_published"
    assert ece["test_ece_train_published"] == pytest.approx(0.18741017924867615)
    assert ece["posthoc_value"] == pytest.approx(0.045)
    # posthoc never becomes primary
    assert ece["primary_value"] != ece["posthoc_value"]


def test_resolve_ece_primary_strict_bare_test_ece_unspecified():
    m = {"test_ece": 0.2}
    ece = resolve_ece_primary(m, from_kernel_train_publish=False)
    assert ece["claim_train_published"] is False
    assert ece["primary"] == "test_ece_unspecified"
    assert ece["test_ece_train_published"] is None
    assert "ece_primary_provenance_unspecified" in ece["gaps"]


def test_mo_inat_source_exact_aliases_not_substring():
    """N1: bare 'mo' substring must not match demo/common."""
    assert is_mo_inat_source("mo") is True
    assert is_mo_inat_source("mushroom_observer") is True
    assert is_mo_inat_source("inaturalist") is True
    assert is_mo_inat_source("inat") is True
    assert is_mo_inat_source("fungitastic") is False
    assert is_mo_inat_source("demo") is False
    assert is_mo_inat_source("common") is False
    assert is_mo_inat_source("gbif_es") is False


def test_runtime_train_domain_label():
    assert runtime_train_domain_label({"fungitastic": 5767}) == "fungitastic_only"
    assert runtime_train_domain_label({"fungitastic": 100, "mo": 50}) == "fungitastic+mo"
    assert runtime_train_domain_label({}) is None


def test_run_suite_missing_models_dir_gap_no_unlock():
    report = run_suite(models_dir=None, run_id="e20c", kernel_slug=None)
    assert report["product_unlock"] is False
    assert report["can_auto_unlock"] is False
    assert report["forage_permission"] is False
    assert report["suite_ok"] is False
    assert report["status"] == "GAP_no_kernel_output"
    # no invented metrics block with fake MAP when models dir is missing
    assert report.get("measured") in (None, True) or "measured" not in report


def test_compare_propagates_mo_inat_gap(tmp_path: Path):
    """S2: compare must re-surface mo_inat_claimed_but_zero_train_obs from snapshot."""
    baseline = {
        "version": "v20-E20-source-holdout",
        "eval_protocol": "source_holdout_e20",
        "train_domain": "fungitastic_plus_soft_non_gbif",
        "test_domain": "gbif_es_only",
        "measured": {
            "test_map_at_3": 0.8575265177160878,
            "safety_recall_deadly_at_1": 0.7895348837209303,
            "safety_recall_deadly_at_3": 0.9217054263565891,
            "n_deadly_in_test": 2580,
            "test_accuracy": 0.8032498307379824,
        },
        "ece": {
            "primary": "train_published",
            "primary_value": 0.18741017924867615,
            "primary_source": "test_ece_train_published",
            "claim_train_published": True,
            "test_ece_train_published": 0.18741017924867615,
            "posthoc_value": 0.045,
        },
        "product_unlock": False,
    }
    candidate = {
        "version": "v20c-E20-mo-inat",
        "eval_protocol": "source_holdout_e20c_mo_inat",
        "train_domain": "fungitastic_plus_mo_inat_non_gbif",
        "train_domain_claimed": "fungitastic_plus_mo_inat_non_gbif",
        "train_domain_runtime": "fungitastic_only",
        "test_domain": "gbif_es_only",
        "measured": {
            "test_map_at_3": 0.8572782667569362,
            "safety_recall_deadly_at_1": 0.789922480620155,
            "safety_recall_deadly_at_3": 0.9186046511627907,
            "n_deadly_in_test": 2580,
            "test_accuracy": 0.8,
        },
        "ece": {
            "primary": "train_published",
            "primary_value": 0.18942074356203395,
            "primary_source": "kernel_metrics_test_ece_as_train_published",
            "claim_train_published": True,
            "test_ece_train_published": None,
            "posthoc_value": None,
        },
        "mo_inat": {
            "claimed_in_protocol_or_config": True,
            "train_source_keys_matching": [],
            "train_mo_inat_obs": 0,
        },
        "source_counts": {"train": {"fungitastic": 5767}, "test": {"gbif_es": 7385}},
        "gaps": ["mo_inat_claimed_but_zero_train_obs"],
        "product_unlock": False,
    }
    bpath = tmp_path / "baseline.json"
    cpath = tmp_path / "candidate.json"
    bpath.write_text(json.dumps(baseline), encoding="utf-8")
    cpath.write_text(json.dumps(candidate), encoding="utf-8")

    report = compare(baseline_path=bpath, candidate_path=cpath)
    assert report["product_unlock"] is False
    assert report["can_auto_unlock"] is False
    assert "mo_inat_claimed_but_zero_train_obs" in report["gaps"]
    assert report["mo_inat_empty_train"] is True
    assert report["honesty"]["mo_inat_gap_resurfaced"] is True
    assert report["candidate"]["mo_inat"]["train_mo_inat_obs"] == 0
    assert "FT-only" in report["operator_action"] or "no MO+iNat uplift" in report["operator_action"]
    # candidate ECE key not synthesized
    assert report["candidate"]["ece"]["test_ece_train_published"] is None
    assert report["candidate"]["ece"]["primary_source"] == (
        "kernel_metrics_test_ece_as_train_published"
    )


def test_compare_default_paths_force_unlock_false_when_missing():
    # Point at non-existent paths via explicit args
    missing = Path("/nonexistent/ssot_does_not_exist_xyz.json")
    report = compare(baseline_path=missing, candidate_path=None)
    assert report["product_unlock"] is False
    assert report["status"] == "GAP_no_candidate"
    assert "candidate_missing" in report["gaps"]
