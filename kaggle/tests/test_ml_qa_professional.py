"""Professional ML QA — table-driven edge cases and suite smoke."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kaggle.ml_qa.artifact_audit import audit_models_dir
from kaggle.ml_qa.e20_split_audit import audit_e20_split
from kaggle.ml_qa.gate_eval import (
    build_operator_unlock_package,
    evaluate_e20_local_artifacts,
    evaluate_product_gates,
    evaluate_product_unlock_criteria,
    write_operator_unlock_package,
)
from kaggle.ml_qa.leak_invariants import (
    check_disjoint_obs,
    check_source_domains,
    run_source_holdout_selftest,
)
from kaggle.ml_qa.metrics_core import (
    deadly_gate_eval,
    deadly_recall_at_k,
    deadly_top1,
    map_at_k,
    recompute_all,
    top1_accuracy,
)
from kaggle.ml_qa.notebook_guards import scan_notebook
from kaggle.ml_qa.pair_metrics import (
    label2idx_to_idx2label,
    run_pair_metrics_suite,
)
from kaggle.ml_qa.open_set_holdout import (
    analyze_open_set_holdout,
    run_open_set_holdout_suite,
    write_calibrated_thresholds,
)
from kaggle.ml_qa.live_reject_monitor import (
    run_live_reject_suite,
    summarize_feedback_log,
    write_s9_report,
)
from datetime import datetime, timezone


def _one_hot_probs(labels: np.ndarray, n_cls: int) -> np.ndarray:
    p = np.zeros((len(labels), n_cls), dtype=np.float64)
    for i, y in enumerate(labels):
        p[i, int(y)] = 1.0
    return p


def test_map_at_3_perfect():
    labels = np.array([0, 1, 2])
    probs = _one_hot_probs(labels, 3)
    assert map_at_k(probs, labels, 3) == pytest.approx(1.0)
    assert top1_accuracy(probs, labels) == pytest.approx(1.0)


def test_map_at_3_rank2():
    # true class is rank 2 → AP = 1/2
    labels = np.array([1])
    probs = np.array([[0.1, 0.3, 0.6]])  # top: 2, 1, 0
    assert map_at_k(probs, labels, 3) == pytest.approx(0.5)


def test_deadly_at_3_not_top1():
    labels = np.array([0, 0])  # deadly class 0
    # rank1 wrong, rank2 true for both
    probs = np.array(
        [
            [0.2, 0.7, 0.1],
            [0.25, 0.6, 0.15],
        ]
    )
    d3, n = deadly_recall_at_k(probs, labels, {0}, k=3)
    d1, _ = deadly_top1(probs, labels, {0})
    assert n == 2
    assert d3 == pytest.approx(1.0)
    assert d1 == pytest.approx(0.0)


@pytest.mark.parametrize("n_deadly", [0])
def test_vacuous_deadly_gate_fail_closed(n_deadly):
    g = deadly_gate_eval(1.0, n_deadly=n_deadly, threshold=0.5)
    assert g["pass"] is False
    assert g["status"] == "unevaluable"
    assert g["value"] is None


def test_deadly_gate_pass_fail():
    assert deadly_gate_eval(0.55, 10, 0.5)["pass"] is True
    assert deadly_gate_eval(0.4, 10, 0.5)["pass"] is False


def test_product_gates_no_unlock():
    g = evaluate_product_gates(0.9, 0.95, n_deadly=100)
    assert g["product_unlock"] is False
    assert g["all_expand_pass"] is True
    g2 = evaluate_product_gates(0.1, 0.95, n_deadly=100)
    assert g2["all_expand_pass"] is False
    g3 = evaluate_product_gates(0.9, 1.0, n_deadly=0)
    assert g3["expand_deadly_at_3"]["pass"] is False


def test_disjoint_obs_detects_leak():
    train = pd.DataFrame({"observation_id": ["a", "b"], "source_db": ["fungitastic"] * 2})
    val = pd.DataFrame({"observation_id": ["c"], "source_db": ["fungitastic"]})
    test = pd.DataFrame({"observation_id": ["a"], "source_db": ["gbif_es"]})
    r = check_disjoint_obs(train, val, test)
    assert r["pass"] is False
    assert r["train_test"] == 1


def test_source_domains_pollution():
    train = pd.DataFrame({"source_db": ["fungitastic", "gbif_es"]})
    test = pd.DataFrame({"source_db": ["gbif_es"]})
    r = check_source_domains(train, test)
    assert r["pass"] is False
    assert r["train_polluted_with_test_domain"] is True


def test_source_holdout_selftest_synthetic():
    rows = []
    for i in range(40):
        rows.append(
            {
                "observation_id": f"ft_{i}",
                "species": f"Sp{i % 5}",
                "source_db": "fungitastic",
                "image_path": f"/data/ft/Sp{i%5}/img_{i}.jpg",
                "license_class": "cc_ok",
            }
        )
    for i in range(40):
        rows.append(
            {
                "observation_id": f"gb_{i}",
                "species": f"Sp{i % 5}",
                "source_db": "gbif_es",
                "image_path": f"/data/gbif/Sp{i%5}/{1000000+i}.jpg",
                "license_class": "nc",
            }
        )
    df = pd.DataFrame(rows)
    out = run_source_holdout_selftest(df, seed=0, val_size=0.25, min_per_class=2)
    assert out["pass"] is True
    assert out["disjoint"]["pass"] is True
    assert out["domains"]["pass"] is True


def test_e19_artifact_flags_deadly_mislabel_if_present():
    p = ROOT / "kaggle" / "kernel_output_v19" / "models"
    if not (p / "metrics.json").is_file() or not (p / "test_predictions.npz").is_file():
        pytest.skip("E19 artifacts not local")
    # Use full class range as proxy deadly set is wrong for real deadly; still
    # map recompute should match. Deadly mislabel detection needs real deadly idxs.
    metrics = json.loads((p / "metrics.json").read_text(encoding="utf-8"))
    z = np.load(p / "test_predictions.npz", allow_pickle=True)
    probs, labels = z["probs"], z["labels"]
    assert abs(float(metrics["test_map_at_3"]) - map_at_k(probs, labels, 3)) < 1e-3
    # Sanity: declared safety_recall_deadly equals top1 on some deadly set is the E19 bug
    # We recompute top1 overall != map necessarily; check helper recompute_all bounds
    rep = recompute_all(probs, labels, set(range(probs.shape[1])), k=3)
    assert 0.0 <= rep["map_at_k"] <= 1.0


def test_e19_deadly_field_suspect_with_deadly_idxs_from_counts():
    """If n_deadly_in_test matches, detect top1 vs at3 mismatch for E19."""
    p = ROOT / "kaggle" / "kernel_output_v19" / "models"
    if not (p / "metrics.json").is_file():
        pytest.skip("no E19")
    metrics = json.loads((p / "metrics.json").read_text(encoding="utf-8"))
    z = np.load(p / "test_predictions.npz", allow_pickle=True)
    probs, labels = z["probs"], z["labels"]
    # Infer deadly idxs: classes that appear in test; use mask from metrics n
    # Build set of classes where using all classes that are in label2idx deadly if present
    # Fallback: try each class as singleton and find set where top1 matches declared
    declared = float(metrics["safety_recall_deadly"])
    n_deadly = int(metrics.get("n_deadly_in_test") or 0)
    # Approximate deadly set = classes with label in a fixed industrial set size 11
    # Use top frequency classes won't work; use label2idx + deadly file if present
    deadly_path = ROOT / "data" / "industrial_v1" / "deadly_set.json"
    l2i_path = p / "label2idx.json"
    if not deadly_path.is_file() or not l2i_path.is_file():
        pytest.skip("no deadly_set/label2idx")
    deadly = json.loads(deadly_path.read_text(encoding="utf-8"))
    names = deadly if isinstance(deadly, list) else deadly.get("species") or deadly.get("latin_names") or []
    if names and isinstance(names[0], dict):
        names = [x.get("latin_name") or x.get("name") for x in names]
    l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
    deadly_idxs = {int(l2i[n]) for n in names if n in l2i}
    if not deadly_idxs:
        pytest.skip("no deadly idx mapping")
    d1, n1 = deadly_top1(probs, labels, deadly_idxs)
    d3, n3 = deadly_recall_at_k(probs, labels, deadly_idxs, k=3)
    assert n1 == n3
    # E19 declared should be closer to d1 than d3
    if abs(declared - d1) < 0.02 and abs(declared - d3) > 0.02:
        # expected historical bug — flag via audit with correct idxs
        rep = audit_models_dir(p, deadly_idxs=deadly_idxs)
        assert rep["checks"].get("deadly_field_is_at3") is False
        assert any("SUSPECT" in f for f in rep["flags"])


def test_e20_notebook_guards():
    candidates = [
        ROOT / "kaggle" / "visionsetil_exp_v20_source_holdout.ipynb",
        ROOT / "kaggle" / "push_e20" / "visionsetil_exp_v20_source_holdout.ipynb",
    ]
    nb = next((p for p in candidates if p.is_file()), None)
    if nb is None:
        pytest.skip("E20 notebook missing")
    r = scan_notebook(nb)
    assert r["pass"] is True, r


def test_product_unlock_fail_closed_without_e20():
    # v19-like soft numbers must NOT unlock without E20 identity
    fake = {
        "version": "v19-E19-gbif-mega",
        "test_map_at_3": 0.96,
        "safety_recall_deadly_at_1": 0.94,
        "safety_recall_deadly_at_3": 0.98,
        "n_deadly_in_test": 400,
    }
    r = evaluate_product_unlock_criteria(fake)
    assert r["product_unlock"] is False
    assert r["unlock_eligible_advisory"] is False
    assert r["checks"]["e20_experiment"] is False


def test_product_unlock_advisory_when_e20_gates_pass():
    fake = {
        "version": "v20-E20-source-holdout",
        "test_map_at_3": 0.30,
        "safety_recall_deadly_at_1": 0.85,
        "safety_recall_deadly_at_3": 0.92,
        "n_deadly_in_test": 100,
    }
    r = evaluate_product_unlock_criteria(fake)
    assert r["product_unlock"] is False  # hard policy
    assert r["can_auto_unlock"] is False
    assert r["unlock_eligible_advisory"] is True
    assert r["eligible_but_locked"] is True
    assert r["operator_cycle_required"] is True
    assert all(r["checks"].values())
    assert any("operator_cycle" in x for x in r["reasons"])
    assert any("operator_cycle" in x for x in r["residual_lock_reasons"])
    assert r["policy"] == "orientation_only_never_consume"
    # Machine-readable checklist rows
    ids = {c["id"] for c in r["checklist"]}
    assert "soft_map" in ids
    assert "orientation_only_policy" in ids
    assert all(c["pass"] for c in r["checklist"])


def test_product_unlock_never_true_from_metrics_alone():
    """No metrics path may return product_unlock True (fail-closed)."""
    samples = [
        None,
        {},
        {
            "version": "v20-E20-source-holdout",
            "test_map_at_3": 0.99,
            "safety_recall_deadly_at_1": 0.99,
            "safety_recall_deadly_at_3": 0.99,
            "n_deadly_in_test": 999,
        },
    ]
    for m in samples:
        r = evaluate_product_unlock_criteria(m)
        assert r["product_unlock"] is False
        assert r["can_auto_unlock"] is False
        assert r.get("forage_permission") is False
        assert r.get("consumption_permission") is False


def test_product_unlock_no_metrics_payload_shape():
    """Missing metrics still returns a full fail-closed operator shape."""
    r = evaluate_product_unlock_criteria(None)
    assert r["product_unlock"] is False
    assert r["can_auto_unlock"] is False
    assert r["unlock_eligible_advisory"] is False
    assert r["eligible_but_locked"] is False
    assert r["forage_permission"] is False
    assert r["consumption_permission"] is False
    assert r["operator_cycle_required"] is True
    assert "no_metrics" in (r.get("reasons") or [])
    residual = r.get("residual_lock_reasons") or []
    assert "policy_orientation_only_never_consume" in residual
    assert "no_auto_unlock_from_metrics_alone" in residual
    assert r.get("operator_action")


def test_product_unlock_pro_tester_fail_blocks_advisory():
    """Status/package SSOT: pro_tester_ok=False must not be eligible-but-locked."""
    fake = {
        "version": "v20-E20-source-holdout",
        "test_map_at_3": 0.30,
        "safety_recall_deadly_at_1": 0.85,
        "safety_recall_deadly_at_3": 0.92,
        "n_deadly_in_test": 100,
    }
    r = evaluate_product_unlock_criteria(
        fake,
        pro_tester_ok=False,
        safe_dp_freeze_ok=True,
    )
    assert r["product_unlock"] is False
    assert r["unlock_eligible_advisory"] is False
    assert r["eligible_but_locked"] is False
    assert r["checks"].get("pro_tester_pass") is False
    assert r["forage_permission"] is False
    assert r["consumption_permission"] is False


def test_operator_unlock_package_regenerable(tmp_path):
    pkg = build_operator_unlock_package(ROOT)
    assert pkg["product_unlock"] is False
    assert pkg["can_auto_unlock"] is False
    assert pkg["forage_permission"] is False
    assert pkg["consumption_permission"] is False
    assert pkg["policy"] == "orientation_only_never_consume"
    assert isinstance(pkg.get("checklist"), list)
    assert len(pkg["checklist"]) >= 1
    assert "residual_lock_reasons" in pkg
    assert pkg.get("live_reject_monitor", {}).get("product_unlock") is False
    out = write_operator_unlock_package(ROOT, out_dir=tmp_path)
    assert (tmp_path / "operator_unlock_checklist.json").is_file()
    assert (tmp_path / "operator_unlock_checklist.md").is_file()
    blob = json.loads((tmp_path / "operator_unlock_checklist.json").read_text(encoding="utf-8"))
    assert blob["product_unlock"] is False
    md = (tmp_path / "operator_unlock_checklist.md").read_text(encoding="utf-8")
    assert "orientation_only" in md or "never" in md.lower()
    assert "product_unlock" in md.lower()
    assert out["product_unlock"] is False


def test_operator_unlock_runbook_exists_and_aligned():
    """Structural: operator-facing runbook documents fail-closed unlock cycle."""
    runbook = ROOT / "docs" / "OPERATOR_UNLOCK_RUNBOOK.md"
    assert runbook.is_file(), f"missing {runbook}"
    text = runbook.read_text(encoding="utf-8")
    lower = text.lower()
    assert "product_unlock" in lower
    assert "false" in lower
    assert "orientation_only" in lower or "orientation only" in lower
    assert "python -m kaggle.ml_qa.gate_eval" in text
    assert "operator_unlock_checklist" in lower
    assert "never" in lower and ("auto" in lower or "auto-flip" in lower or "auto flip" in lower)
    assert "forage" in lower or "consumption" in lower
    assert "s9" in lower or "live reject" in lower
    assert "human" in lower and "operator" in lower
    assert "vite_beta_feedback_url" in lower or "gtm" in lower


def test_e20_local_artifacts_fail_closed_until_metrics():
    r = evaluate_e20_local_artifacts(ROOT)
    assert r["product_unlock"] is False
    # Without metrics.json under kernel_output_v20 → not eligible
    metrics = ROOT / "kaggle" / "kernel_output_v20" / "models" / "metrics.json"
    if not metrics.is_file():
        assert r["unlock_eligible_advisory"] is False
        assert "no_metrics" in (r.get("reasons") or [])


def test_e20_split_audit_when_manifest_present():
    suite = audit_e20_split(ROOT)
    assert suite["name"].startswith("S7")
    manifest = ROOT / "kaggle" / "kernel_output_v20" / "models" / "split_manifest.json"
    if not manifest.is_file():
        assert suite["status"] == "SKIP"
        return
    assert suite["status"] in ("PASS", "FAIL")
    if suite["status"] == "PASS":
        leaks = suite.get("metrics", {}).get("leaks") or {}
        assert all(int(v) == 0 for v in leaks.values())


def test_e20_postprocess_no_metrics_exit_code():
    """Postprocess without metrics returns 2 and never unlocks."""
    import subprocess

    r = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "e20_postprocess.py")],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    # 0 if metrics exist, 2 if not
    assert r.returncode in (0, 2)
    eval_path = ROOT / "eval" / "reports" / "ml_experiments" / "e20_unlock_eval.json"
    assert eval_path.is_file()
    rep = json.loads(eval_path.read_text(encoding="utf-8"))
    assert rep.get("product_unlock") is False


def test_pair_metrics_label2idx_roundtrip():
    l2i = {"Amanita muscaria": 2, "Boletus edulis": 5}
    i2l = label2idx_to_idx2label(l2i)
    assert i2l[2] == "Amanita muscaria"
    assert i2l[5] == "Boletus edulis"


def test_pair_metrics_suite_catalog_and_optional_preds():
    suite = run_pair_metrics_suite(ROOT)
    assert suite["name"].startswith("S5")
    assert suite["status"] in ("PASS", "FAIL")
    assert int(suite.get("metrics", {}).get("n_directed_pairs") or 0) >= 20
    # With local v19 artifacts, confusion rates should be present
    p19 = ROOT / "kaggle" / "kernel_output_v19" / "models" / "test_predictions.npz"
    if p19.is_file():
        assert suite["status"] == "PASS"
        m = suite["metrics"]
        assert m.get("n_eval_samples") is not None
        assert m.get("true_in_topk_rate") is not None
        assert m.get("lookalike_mate_in_topk_rate") is not None


def test_open_set_holdout_suite_e20_when_present(tmp_path):
    """S8 monitor: never unlocks; recommends thr when v20 npz present."""
    suite = run_open_set_holdout_suite(ROOT, write_thresholds=False)
    assert suite["name"].startswith("S8")
    assert suite["status"] in ("PASS", "SKIP")
    assert suite.get("metrics", {}).get("product_unlock") is False
    p20 = ROOT / "kaggle" / "kernel_output_v20" / "models" / "test_predictions.npz"
    if not p20.is_file():
        assert suite["status"] == "SKIP"
        return
    assert suite["status"] == "PASS"
    m = suite["metrics"]
    assert m.get("ok") is True
    assert m.get("n", 0) > 0
    rec = m.get("recommended") or {}
    assert rec.get("conf_thr") is not None
    assert float(rec.get("reject_rate") or 0) >= 0.0
    # Multiview 0.10/0.0 should reject near-zero on overconfident E20 softmax
    mv = m.get("current_multiview_thr") or {}
    assert float(mv.get("reject_rate") or 0) < 0.05
    thr_path = tmp_path / "open_set_thresholds.json"
    write_calibrated_thresholds(m, thr_path)
    blob = json.loads(thr_path.read_text(encoding="utf-8"))
    assert blob["product_unlock"] is False
    assert str(blob["status"]).startswith("calibrated")
    assert blob["calibrated_threshold"] == rec["conf_thr"]


def test_analyze_open_set_holdout_no_unlock_policy():
    a = analyze_open_set_holdout(ROOT)
    assert a.get("product_unlock") is False


def test_live_reject_suite_never_unlocks(tmp_path):
    suite = run_live_reject_suite(ROOT)
    assert suite["name"].startswith("S9")
    assert suite["status"] in ("PASS", "SKIP", "FAIL")
    assert suite.get("metrics", {}).get("product_unlock") is False
    assert suite.get("product_unlock") is False
    # synthetic log
    log = tmp_path / "classification_log.jsonl"
    log.write_text(
        json.dumps({"decision": "accepted", "rejection_reason": None})
        + "\n"
        + json.dumps({"decision": "rejected", "rejection_reason": "high_entropy"})
        + "\n",
        encoding="utf-8",
    )
    m = summarize_feedback_log(log)
    assert m["product_unlock"] is False
    assert m["status"] == "ok"
    assert m["n_entries"] == 2
    assert m["reject_rate"] == pytest.approx(0.5)
    assert m["reasons"].get("high_entropy") == 1
    assert m["reason_histogram"].get("high_entropy") == 1
    suite2 = run_live_reject_suite(ROOT, log_path=log)
    assert suite2["status"] == "PASS"
    assert suite2["product_unlock"] is False


def test_live_reject_empty_and_missing_skip(tmp_path):
    missing = tmp_path / "no_such.jsonl"
    m_miss = summarize_feedback_log(missing)
    assert m_miss["status"] == "no_log"
    assert m_miss["product_unlock"] is False
    assert m_miss["n_entries"] == 0
    s_miss = run_live_reject_suite(ROOT, log_path=missing)
    assert s_miss["status"] == "SKIP"
    assert s_miss["product_unlock"] is False

    empty = tmp_path / "empty.jsonl"
    empty.write_text("", encoding="utf-8")
    m_empty = summarize_feedback_log(empty)
    assert m_empty["status"] == "empty"
    assert m_empty["product_unlock"] is False
    assert m_empty["reject_rate"] is None
    s_empty = run_live_reject_suite(ROOT, log_path=empty)
    assert s_empty["status"] == "SKIP"


def test_live_reject_fixture_histogram():
    """Committed mixed fixture drives real summarize path (non-empty reasons)."""
    fixture = ROOT / "data" / "feedback" / "fixtures" / "s9_mixed_reject.jsonl"
    assert fixture.is_file(), "committed S9 fixture missing"
    # Pin "now" so 7d/24h windows are deterministic vs fixture timestamps
    now = datetime(2026, 7, 28, 12, 0, 0, tzinfo=timezone.utc)
    m = summarize_feedback_log(fixture, now=now)
    assert m["product_unlock"] is False
    assert m["status"] == "ok"
    # v1.9.3: grown fixture (≥20) for richer windows / reason histogram
    assert m["n_entries"] >= 20
    assert m["n_rejected"] > 0
    assert 0.0 <= float(m["reject_rate"]) <= 1.0
    assert m["reasons"], "reject reasons histogram must be non-empty"
    assert m["reason_histogram"]
    # open_set_reason fallback path present in fixture
    assert any(k in m["reasons"] for k in ("high_entropy", "low_confidence", "low_margin"))
    # Grown diversity: OOD / threshold / gate paths (orientation only)
    assert any(
        k in m["reasons"]
        for k in ("out_of_distribution", "below_threshold", "gate_blocked", "unknown_taxon")
    )
    assert "windows" in m
    assert "7d" in m["windows"] and "24h" in m["windows"] and "all" in m["windows"]
    assert "30d" in m["windows"]
    assert m["windows"]["all"]["n_entries"] == m["n_entries"]
    # 24h window should be smaller than all when older rows exist
    assert m["windows"]["24h"]["n_entries"] < m["windows"]["all"]["n_entries"]
    assert m["windows"]["24h"]["n_entries"] >= 1
    assert m["windows"]["7d"]["n_entries"] <= m["windows"]["all"]["n_entries"]
    assert m["windows"]["30d"]["n_entries"] <= m["windows"]["all"]["n_entries"]
    assert isinstance(m.get("health_flags"), list)
    # Multiview honesty from view_coverage in fixture
    mv = m.get("multiview") or {}
    assert int(mv.get("n_with_view_labels") or 0) >= 10
    assert int(mv.get("n_diag_full_gills_front_detail") or 0) >= 2
    assert int(mv.get("n_multiview_ge2") or 0) >= 5
    assert mv.get("priority_views")
    assert "gills" in (mv.get("priority_views") or [])
    # v1.9.8 traffic depth + mode histogram
    assert m.get("traffic_depth") in ("thin", "moderate", "rich", "sparse")
    assert m.get("n_real_mode", 0) >= 1
    assert isinstance(m.get("modes"), dict)
    # Never unlock even with rich traffic fixture
    assert m["product_unlock"] is False
    suite = run_live_reject_suite(ROOT, log_path=fixture, now=now)
    assert suite["status"] == "PASS"
    assert suite["product_unlock"] is False
    detail = json.loads(suite["detail"])
    assert detail["n_entries"] >= 20
    assert detail["reasons"]
    assert "windows" in detail
    assert "health_flags" in detail
    assert "multiview" in detail
    assert detail.get("traffic_depth")
    assert detail["multiview"].get("n_with_view_labels", 0) >= 10
    # Fixture policy stamp: every line must keep product_unlock false when present
    raw_lines = [
        ln for ln in fixture.read_text(encoding="utf-8").splitlines() if ln.strip()
    ]
    assert len(raw_lines) >= 30
    for ln in raw_lines:
        row = json.loads(ln)
        meta = row.get("metadata") or {}
        assert meta.get("product_unlock") is False
        assert "forage" not in json.dumps(row).lower() or "never" in json.dumps(row).lower()


def test_s9_write_report_never_unlocks(tmp_path):
    fixture = ROOT / "data" / "feedback" / "fixtures" / "s9_mixed_reject.jsonl"
    rep = write_s9_report(ROOT, log_path=fixture, out_dir=tmp_path)
    assert rep["product_unlock"] is False
    path = tmp_path / "s9_live_reject_latest.json"
    assert path.is_file()
    blob = json.loads(path.read_text(encoding="utf-8"))
    assert blob["product_unlock"] is False
    assert blob["suite_status"] in ("PASS", "SKIP", "FAIL")
    assert blob.get("metrics", {}).get("product_unlock") is False
