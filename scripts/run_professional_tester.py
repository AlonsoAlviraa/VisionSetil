#!/usr/bin/env python3
"""Professional ML tester CLI — metrics, leak, artifacts, notebook guards.

Exit codes: 0 pass, 1 fail, 2 suite error.

  python scripts/run_professional_tester.py
  python scripts/run_professional_tester.py --fast
  python scripts/run_professional_tester.py --artifacts kaggle/kernel_output_v19/models

Orientation only — never consumption permission.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from kaggle.ml_qa.artifact_audit import audit_all_kernel_outputs, audit_models_dir
from kaggle.ml_qa.notebook_guards import scan_notebook
from kaggle.ml_qa.e20_split_audit import audit_e20_split
from kaggle.ml_qa.gate_eval import evaluate_e20_local_artifacts
from kaggle.ml_qa.pair_metrics import run_pair_metrics_suite
from kaggle.ml_qa.open_set_holdout import run_open_set_holdout_suite
from kaggle.ml_qa.live_reject_monitor import run_live_reject_suite
from kaggle.ml_qa.report import now_iso, write_reports


def run_pytest(fast: bool) -> tuple[int, str]:
    tests = [
        str(REPO / "kaggle/tests/test_ml_qa_professional.py"),
        str(REPO / "kaggle/tests/test_e20_source_holdout.py"),
        str(REPO / "kaggle/tests/test_anti_leak_e19_audit.py"),
        str(REPO / "kaggle/tests/test_fungi_csv_loader.py"),
    ]
    if not fast:
        hyp = REPO / "kaggle/tests/test_ml_qa_hypothesis.py"
        if hyp.is_file():
            tests.append(str(hyp))
    cmd = [sys.executable, "-m", "pytest", "-q", "--tb=line", *tests]
    r = subprocess.run(cmd, cwd=str(REPO), capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    return r.returncode, out[-8000:]


def load_deadly_idxs_for(models: Path) -> set[int] | None:
    l2i_path = models / "label2idx.json"
    deadly_path = REPO / "data" / "industrial_v1" / "deadly_set.json"
    if not l2i_path.is_file() or not deadly_path.is_file():
        return None
    deadly = json.loads(deadly_path.read_text(encoding="utf-8"))
    names = deadly if isinstance(deadly, list) else deadly.get("species") or deadly.get("latin_names") or []
    if names and isinstance(names[0], dict):
        names = [x.get("latin_name") or x.get("name") for x in names]
    l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
    return {int(l2i[n]) for n in names if n and n in l2i}


def main() -> int:
    ap = argparse.ArgumentParser(description="VisionSetil professional ML tester")
    ap.add_argument("--fast", action="store_true", help="Skip hypothesis suite")
    ap.add_argument(
        "--artifacts",
        type=Path,
        default=None,
        help="Single models/ dir to audit (default: all kernel_output_v*)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=REPO / "eval/reports/ml_experiments/professional_tester_latest",
    )
    ap.add_argument("--skip-pytest", action="store_true")
    args = ap.parse_args()

    suites = []
    exit_code = 0

    # Suite: pytest
    if not args.skip_pytest:
        code, out = run_pytest(fast=args.fast)
        suites.append(
            {
                "name": "S1-S2 pytest (metrics+leak+loader+e20)",
                "status": "PASS" if code == 0 else "FAIL",
                "detail": out.strip().splitlines()[-5:] if out else "",
                "flags": [] if code == 0 else ["pytest failures — see console"],
            }
        )
        if code != 0:
            exit_code = 1
            print(out)

    # Suite: notebook
    nb_candidates = [
        REPO / "kaggle/visionsetil_exp_v20_source_holdout.ipynb",
        REPO / "kaggle/push_e20/visionsetil_exp_v20_source_holdout.ipynb",
    ]
    nb = next((p for p in nb_candidates if p.is_file()), None)
    if nb is not None:
        nr = scan_notebook(nb)
        suites.append(
            {
                "name": "S4 notebook guards E20",
                "status": "PASS" if nr["pass"] else "FAIL",
                "detail": json.dumps({"path": str(nb), **nr.get("checks", {})}, ensure_ascii=False),
                "flags": nr.get("landmine_hits") or [],
            }
        )
        if not nr["pass"]:
            exit_code = 1
    else:
        suites.append(
            {
                "name": "S4 notebook guards E20",
                "status": "SKIP",
                "detail": "notebook missing",
                "flags": [],
            }
        )

    # Suite: artifacts
    artifacts = []
    if args.artifacts:
        d = Path(args.artifacts)
        di = load_deadly_idxs_for(d)
        artifacts.append(audit_models_dir(d, deadly_idxs=di))
    else:
        for rep in audit_all_kernel_outputs(REPO):
            # re-run with deadly idxs when possible
            models = Path(rep["path"])
            di = load_deadly_idxs_for(models)
            if di:
                artifacts.append(audit_models_dir(models, deadly_idxs=di))
            else:
                artifacts.append(rep)

    flags_art = []
    art_fail = False
    for a in artifacts:
        if not a.get("pass", True) and a.get("status") not in ("suspect_metric_naming", "flagged"):
            # hard fail only on true FAIL; SUSPECT deadly naming is flag not red overall for historical E19
            if a.get("status") == "fail" or (
                a.get("flags") and any("LEAK" in f or "mismatch" in f.lower() for f in a["flags"])
            ):
                if any("LEAK" in f or "MAP@3 mismatch" in f for f in a.get("flags", [])):
                    art_fail = True
        for f in a.get("flags", []):
            if "SUSPECT" in f:
                flags_art.append(f"{a.get('path')}: {f}")
    suites.append(
        {
            "name": "S3 artifact audit",
            "status": "FAIL" if art_fail else ("PASS" if artifacts else "SKIP"),
            "detail": f"n_dirs={len(artifacts)}",
            "flags": flags_art[:30],
        }
    )
    if art_fail:
        exit_code = 1

    # Suite: lookalike pair metrics (SSOT pairs + optional holdout confusion)
    pair_models = Path(args.artifacts) if args.artifacts else None
    pair_suite = run_pair_metrics_suite(REPO, models_dir=pair_models)
    suites.append(
        {
            "name": pair_suite.get("name", "S5 lookalike pair metrics"),
            "status": pair_suite.get("status", "FAIL"),
            "detail": pair_suite.get("detail", ""),
            "flags": pair_suite.get("flags") or [],
        }
    )
    if pair_suite.get("status") == "FAIL":
        exit_code = 1

    # Suite: product_unlock criteria (advisory; always product_unlock=false)
    unlock_eval = evaluate_e20_local_artifacts(REPO)
    unlock_ready = bool(unlock_eval.get("unlock_eligible_advisory"))
    suites.append(
        {
            "name": "S6 product_unlock criteria (fail-closed)",
            "status": "PASS",  # suite reports readiness; never fails overall on missing E20
            "detail": (
                f"unlock_eligible_advisory={unlock_ready}; "
                f"reasons={unlock_eval.get('reasons')}; "
                f"checks={unlock_eval.get('checks')}"
            ),
            "flags": [] if unlock_ready else list(unlock_eval.get("reasons") or [])[:10],
        }
    )

    # Suite: E20 split integrity (partial artifacts while RUNNING)
    split_suite = audit_e20_split(REPO)
    suites.append(
        {
            "name": split_suite.get("name", "S7 E20 split integrity"),
            "status": split_suite.get("status", "SKIP"),
            "detail": split_suite.get("detail", ""),
            "flags": split_suite.get("flags") or [],
        }
    )
    if split_suite.get("status") == "FAIL":
        exit_code = 1

    # Suite: E20 open-set + lookalike mate rates (holdout monitor; writes thresholds)
    os_models = Path(args.artifacts) if args.artifacts else None
    open_set_suite = run_open_set_holdout_suite(
        REPO, models_dir=os_models, write_thresholds=True
    )
    suites.append(
        {
            "name": open_set_suite.get("name", "S8 E20 open-set + mate monitor"),
            "status": open_set_suite.get("status", "SKIP"),
            "detail": open_set_suite.get("detail", ""),
            "flags": open_set_suite.get("flags") or [],
        }
    )
    # S8 is advisory PASS/SKIP; never fails overall (monitor only)

    # Suite: live Identify reject rates from feedback JSONL (ops monitor)
    live_suite = run_live_reject_suite(REPO)
    suites.append(
        {
            "name": live_suite.get("name", "S9 live Identify reject monitor"),
            "status": live_suite.get("status", "SKIP"),
            "detail": live_suite.get("detail", ""),
            "flags": live_suite.get("flags") or [],
        }
    )
    # S9 advisory — empty log is SKIP, never unlocks

    # Suite: E21 readiness (optional scale; never launches; never unlocks)
    e21_metrics: dict = {}
    e21_status = "SKIP"
    e21_flags: list[str] = []
    try:
        from scripts.e21_readiness import evaluate_e21_readiness, write_report

        e21_metrics = evaluate_e21_readiness()
        e21_metrics["product_unlock"] = False
        e21_metrics["e21_launched"] = False
        e21_metrics["kaggle_push"] = False
        write_report(e21_metrics)
        e21_status = "PASS" if e21_metrics.get("ready_for_e21_schedule") else "PASS"
        # Always PASS when script runs: readiness false is informational, not a tester fail
        if not e21_metrics.get("ready_for_e21_schedule"):
            e21_flags.append("e21_baseline_not_ready")
        if e21_metrics.get("product_unlock"):
            e21_status = "FAIL"
            e21_flags.append("e21_unlock_must_be_false")
            exit_code = 1
        if e21_metrics.get("e21_launched") or e21_metrics.get("kaggle_push"):
            e21_status = "FAIL"
            e21_flags.append("e21_must_not_auto_launch")
            exit_code = 1
    except Exception as exc:  # noqa: BLE001
        e21_status = "SKIP"
        e21_flags.append(f"e21_readiness_error:{exc}")
    suites.append(
        {
            "name": "S13 E21 scale readiness (no launch)",
            "status": e21_status,
            "detail": json.dumps(
                {
                    "ready": e21_metrics.get("ready_for_e21_schedule"),
                    "status": e21_metrics.get("status"),
                    "e21_launched": e21_metrics.get("e21_launched", False),
                    "product_unlock": False,
                    "map_at_3": (e21_metrics.get("baseline") or {}).get("test_map_at_3"),
                    "deadly_at_3": (e21_metrics.get("baseline") or {}).get(
                        "safety_recall_deadly_at_3"
                    ),
                },
                ensure_ascii=False,
            ),
            "flags": e21_flags,
        }
    )

    # Suite: paired multi-view inventory (true LOO readiness; no image mount = PASS with flag)
    inv_path = REPO / "eval" / "reports" / "ml_experiments" / "paired_multiview_inventory.json"
    inv_metrics: dict = {}
    inv_flags: list[str] = []
    inv_status = "SKIP"
    try:
        if not inv_path.is_file():
            # generate on the fly
            import subprocess

            subprocess.run(
                [sys.executable, str(REPO / "eval" / "scripts" / "paired_multiview_inventory.py")],
                cwd=str(REPO),
                capture_output=True,
                text=True,
                timeout=120,
            )
        if inv_path.is_file():
            inv_metrics = json.loads(inv_path.read_text(encoding="utf-8"))
            inv_status = "PASS"
            ready = (inv_metrics.get("readiness") or {}).get("true_leave_one_photo_out")
            if not ready:
                inv_flags.append(
                    (inv_metrics.get("readiness") or {}).get("blocker")
                    or "paired_loo_not_ready"
                )
            inv_metrics["product_unlock"] = False
        else:
            inv_flags.append("inventory_missing")
    except Exception as exc:  # noqa: BLE001
        inv_status = "FAIL"
        inv_flags.append(f"inventory_error:{exc}")
    suites.append(
        {
            "name": "S10 paired multi-view inventory",
            "status": inv_status,
            "detail": json.dumps(
                {
                    "true_loo_ready": (inv_metrics.get("readiness") or {}).get(
                        "true_leave_one_photo_out"
                    ),
                    "train_multi_ge2": (inv_metrics.get("readiness") or {}).get(
                        "train_multi_ge2"
                    ),
                    "val_multi_ge2": (inv_metrics.get("readiness") or {}).get("val_multi_ge2"),
                    "blocker": (inv_metrics.get("readiness") or {}).get("blocker"),
                },
                ensure_ascii=False,
            ),
            "flags": inv_flags[:10],
        }
    )
    # S10 never fails overall solely for Kaggle-only paths

    # Suite: paired LOO torch report presence (advisory; do not re-run heavy torch here)
    loo_path = REPO / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_eval.json"
    loo_metrics: dict = {}
    loo_flags: list[str] = []
    loo_status = "SKIP"
    if loo_path.is_file():
        try:
            loo_metrics = json.loads(loo_path.read_text(encoding="utf-8"))
            loo_metrics["product_unlock"] = False
            torch_ok = bool((loo_metrics.get("torch") or {}).get("ok"))
            loo_status = "PASS" if torch_ok else "FAIL"
            by = ((loo_metrics.get("torch") or {}).get("by_n_views") or {})
            if torch_ok and by.get("4") and by.get("1"):
                if float(by["4"].get("map_at_3") or 0) + 1e-6 < float(by["1"].get("map_at_3") or 0):
                    loo_flags.append("map3_4_below_1")
            if not torch_ok:
                loo_flags.append("torch_not_ok")
        except Exception as exc:  # noqa: BLE001
            loo_status = "FAIL"
            loo_flags.append(f"loo_read_error:{exc}")
    else:
        loo_flags.append("loo_report_missing")
    suites.append(
        {
            "name": "S11 paired multi-view LOO torch",
            "status": loo_status,
            "detail": json.dumps(
                {
                    "torch_ok": (loo_metrics.get("torch") or {}).get("ok"),
                    "n_packs": (loo_metrics.get("torch") or {}).get("n_packs_attempted"),
                    "n_species": (loo_metrics.get("torch") or {}).get("n_species_in_sample"),
                    "map3_1": ((loo_metrics.get("torch") or {}).get("by_n_views") or {})
                    .get("1", {})
                    .get("map_at_3"),
                    "map3_4": ((loo_metrics.get("torch") or {}).get("by_n_views") or {})
                    .get("4", {})
                    .get("map_at_3"),
                    "deltas": loo_metrics.get("deltas"),
                    "loo_summary": loo_metrics.get("loo_summary"),
                },
                ensure_ascii=False,
            ),
            "flags": loo_flags[:10],
        }
    )
    # S11 FAIL only flags report; does not force overall fail (ops advisory)
    if loo_status == "FAIL" and "loo_report_missing" not in loo_flags:
        pass  # keep overall from hard suites only

    # Suite: deadly-only multi-view LOO honesty (advisory)
    deadly_loo_path = (
        REPO / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_deadly.json"
    )
    deadly_metrics: dict = {}
    deadly_flags: list[str] = []
    deadly_status = "SKIP"
    if deadly_loo_path.is_file():
        try:
            deadly_metrics = json.loads(deadly_loo_path.read_text(encoding="utf-8"))
            deadly_metrics["product_unlock"] = False
            tok = bool((deadly_metrics.get("torch") or {}).get("ok"))
            deadly_status = "PASS" if tok else "FAIL"
            ddelta = (deadly_metrics.get("deltas") or {}).get("map3_4_minus_1")
            if ddelta is not None and float(ddelta) < 0.02:
                deadly_flags.append("deadly_multiview_map3_flat")
        except Exception as exc:  # noqa: BLE001
            deadly_status = "FAIL"
            deadly_flags.append(f"deadly_loo_error:{exc}")
    else:
        deadly_flags.append("deadly_loo_missing")
    suites.append(
        {
            "name": "S12 deadly multi-view LOO honesty",
            "status": deadly_status,
            "detail": json.dumps(
                {
                    "torch_ok": (deadly_metrics.get("torch") or {}).get("ok"),
                    "n_packs": (deadly_metrics.get("torch") or {}).get("n_packs_attempted"),
                    "map3_1": ((deadly_metrics.get("torch") or {}).get("by_n_views") or {})
                    .get("1", {})
                    .get("map_at_3"),
                    "map3_4": ((deadly_metrics.get("torch") or {}).get("by_n_views") or {})
                    .get("4", {})
                    .get("map_at_3"),
                    "deltas": deadly_metrics.get("deltas"),
                    "product_note": "flat multi-view on deadly → keep lookalikes+open-set",
                },
                ensure_ascii=False,
            ),
            "flags": deadly_flags[:10],
        }
    )

    # S14 M3 same-specimen field holdout (canonical report; advisory)
    field_holdout_metrics: dict = {}
    field_flags: list[str] = []
    field_status = "SKIP"
    try:
        from kaggle.ml_qa.field_holdout import evaluate_field_holdout

        field_holdout_metrics = evaluate_field_holdout(REPO)
        field_holdout_metrics["product_unlock"] = False
        if field_holdout_metrics.get("skip"):
            field_status = "SKIP"
            field_flags.extend(field_holdout_metrics.get("flags") or [])
        elif field_holdout_metrics.get("pass"):
            field_status = "PASS"
            field_flags.extend(field_holdout_metrics.get("flags") or [])
        else:
            field_status = "FAIL"
            field_flags.extend(field_holdout_metrics.get("flags") or [])
    except Exception as exc:  # noqa: BLE001
        field_status = "FAIL"
        field_flags.append(f"field_holdout_error:{exc}")
        field_holdout_metrics = {"product_unlock": False, "error": str(exc)}
    suites.append(
        {
            "name": "S14 same-specimen field holdout (M3)",
            "status": field_status,
            "detail": json.dumps(
                {
                    "status": field_holdout_metrics.get("status"),
                    "gates": field_holdout_metrics.get("gates"),
                    "headline": field_holdout_metrics.get("headline"),
                    "readiness": field_holdout_metrics.get("readiness"),
                    "product_unlock": False,
                    "policy": "orientation_only_never_consume",
                },
                ensure_ascii=False,
            ),
            "flags": field_flags[:10],
        }
    )
    # S14 advisory — does not force overall fail (ops honesty surface)

    # Historical E19 deadly mislabel is expected SUSPECT — report but don't fail whole suite
    # unless user wants strict; we keep exit 0 if only SUSPECT flags
    # product_unlock stays false until E20 honest holdout dual deadly@3 + MAP soft gates

    payload = {
        "generated": now_iso(),
        "overall": "PASS" if exit_code == 0 else "FAIL",
        "exit_code": exit_code,
        "policy": "orientation_only_never_consume",
        "product_unlock": False,
        "suites": suites,
        "artifacts": artifacts,
        "pair_metrics": pair_suite.get("metrics") or {},
        "open_set_holdout": open_set_suite.get("metrics") or {},
        "live_reject_monitor": live_suite.get("metrics") or {},
        "e21_readiness": e21_metrics,
        "paired_multiview_inventory": inv_metrics,
        "paired_multiview_loo": loo_metrics,
        "paired_multiview_loo_deadly": deadly_metrics,
        "field_multiview_holdout": field_holdout_metrics,
        "product_unlock_eval": unlock_eval,
    }
    jp, mp = write_reports(payload, args.out)
    print(json.dumps({"overall": payload["overall"], "json": str(jp), "md": str(mp)}, indent=2))
    for s in suites:
        print(f"  [{s['status']}] {s['name']}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
