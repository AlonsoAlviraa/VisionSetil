#!/usr/bin/env python3
"""Compare a candidate lab run metrics file against E20 SSOT baseline.

Metrics only from SSOT files — never invent MAP/deadly/ECE.
Always product_unlock=false. Dual ECE primary=train-published when claimed.

Writes:
  eval/reports/ml_experiments/loop_compare_to_baseline_latest.json
  eval/reports/ml_experiments/loop_compare_to_baseline_latest.md

Usage:
  python scripts/loop_ml_compare_to_baseline.py
  python scripts/loop_ml_compare_to_baseline.py --candidate eval/reports/ml_experiments/e20c_metrics_snapshot.json
  python scripts/loop_ml_compare_to_baseline.py --candidate PATH --baseline PATH
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.verify_anti_leak_rails_for_train import _repo_rel  # noqa: E402

POLICY = "orientation_only_never_consume"
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
BASELINE_DEFAULT = REPORT_DIR / "E20_BASELINE_METRICS_TO_IMPROVE.json"
CANDIDATE_DEFAULTS = (
    REPORT_DIR / "e20c_metrics_snapshot.json",
    REPORT_DIR / "loop_post_train_suite_latest.json",
)
OUT_JSON = REPORT_DIR / "loop_compare_to_baseline_latest.json"
OUT_MD = REPORT_DIR / "loop_compare_to_baseline_latest.md"

# Advisory crash thresholds (lab only — never unlock)
MAP_CRASH = -0.05  # candidate - baseline
DEADLY3_CRASH = -0.05


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _f(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def _extract_measured(blob: dict[str, Any]) -> dict[str, Any]:
    """Pull measured block + ECE from suite snapshot, SSOT, or raw metrics.json."""
    measured_src = blob.get("measured") if isinstance(blob.get("measured"), dict) else {}
    ece_src = blob.get("ece") if isinstance(blob.get("ece"), dict) else {}

    map3 = _f(
        measured_src.get("test_map_at_3")
        if measured_src
        else blob.get("test_map_at_3")
    )
    d1 = _f(
        measured_src.get("safety_recall_deadly_at_1")
        if measured_src
        else blob.get("safety_recall_deadly_at_1")
    )
    d3 = _f(
        measured_src.get("safety_recall_deadly_at_3")
        if measured_src
        else blob.get("safety_recall_deadly_at_3")
    )
    if d3 is None:
        d3 = _f(blob.get("safety_recall_deadly"))
    n_deadly = (
        measured_src.get("n_deadly_in_test")
        if measured_src
        else blob.get("n_deadly_in_test")
    )
    if n_deadly is None:
        n_deadly = blob.get("n_deadly_eval")

    # ECE primary
    if ece_src:
        ece_primary = _f(ece_src.get("primary_value"))
        ece_label = ece_src.get("primary")
        ece_claim = ece_src.get("claim_train_published")
        ece_source = ece_src.get("primary_source")
        ece_posthoc = _f(ece_src.get("posthoc_value") or ece_src.get("test_ece_posthoc"))
        ece_train_pub = _f(ece_src.get("test_ece_train_published"))
        if ece_train_pub is None and ece_claim and ece_primary is not None:
            ece_train_pub = ece_primary
    else:
        ece_train_pub = _f(blob.get("test_ece_train_published"))
        ece_raw = _f(blob.get("test_ece"))
        ece_posthoc = _f(blob.get("test_ece_posthoc"))
        if ece_train_pub is not None:
            ece_primary = ece_train_pub
            ece_label = "train_published"
            ece_claim = True
            ece_source = "test_ece_train_published"
        elif ece_raw is not None:
            ece_primary = ece_raw
            ece_label = "test_ece_unspecified"
            ece_claim = False
            ece_source = "test_ece_fallback"
        else:
            ece_primary = None
            ece_label = "missing"
            ece_claim = False
            ece_source = None

    return {
        "test_map_at_3": map3,
        "safety_recall_deadly_at_1": d1,
        "safety_recall_deadly_at_3": d3,
        "n_deadly_in_test": n_deadly,
        "test_accuracy": _f(
            measured_src.get("test_accuracy") if measured_src else blob.get("test_accuracy")
        ),
        "version": blob.get("version") or measured_src.get("version"),
        "eval_protocol": blob.get("eval_protocol") or measured_src.get("eval_protocol"),
        "test_domain": blob.get("test_domain") or measured_src.get("test_domain"),
        "train_domain": blob.get("train_domain") or measured_src.get("train_domain"),
        "ece_primary_value": ece_primary,
        "ece_primary_label": ece_label,
        "ece_claim_train_published": ece_claim,
        "ece_primary_source": ece_source,
        "ece_posthoc_value": ece_posthoc,
        "ece_train_published_value": ece_train_pub,
    }


def _delta(a: float | None, b: float | None) -> float | None:
    """candidate - baseline."""
    if a is None or b is None:
        return None
    return a - b


def resolve_candidate(explicit: Path | None) -> Path | None:
    if explicit is not None:
        p = Path(explicit)
        return p if p.is_file() else None
    for c in CANDIDATE_DEFAULTS:
        if c.is_file():
            return c
    # raw kernel metrics if present
    for p in (
        ROOT / "kaggle" / "kernel_output_v20c" / "models" / "metrics.json",
        ROOT / "kaggle" / "kernel_output_v20b" / "models" / "metrics.json",
    ):
        if p.is_file():
            return p
    return None


def compare(
    *,
    baseline_path: Path,
    candidate_path: Path | None,
) -> dict[str, Any]:
    gaps: list[str] = []
    baseline_blob = _load_json(baseline_path)
    if not isinstance(baseline_blob, dict):
        gaps.append("baseline_ssot_missing")
        baseline_blob = {}

    if candidate_path is None:
        gaps.append("candidate_missing")
        return {
            "generated_at": _utc_now(),
            "status": "GAP_no_candidate",
            "policy": POLICY,
            "product_unlock": False,
            "can_auto_unlock": False,
            "forage_permission": False,
            "consumption_permission": False,
            "lab_only": True,
            "metrics_label": "[MEASURED]",
            "baseline_path": _repo_rel(baseline_path) or str(baseline_path),
            "candidate_path": None,
            "gaps": gaps,
            "operator_action": (
                "GAP: no candidate metrics (E20c suite/snapshot missing). "
                "Use E20 baseline SSOT only; never auto unlock."
            ),
            "honesty": {
                "metrics_from_ssot_files_only": True,
                "dual_ece_primary": "train_published_when_proven",
                "product_unlock_forced_false": True,
            },
        }

    candidate_blob = _load_json(candidate_path)
    if not isinstance(candidate_blob, dict):
        gaps.append("candidate_unreadable")
        candidate_blob = {}

    base = _extract_measured(baseline_blob)
    cand = _extract_measured(candidate_blob)

    rows = []
    for key, label in (
        ("test_map_at_3", "MAP@3"),
        ("safety_recall_deadly_at_1", "deadly@1"),
        ("safety_recall_deadly_at_3", "deadly@3"),
        ("test_accuracy", "accuracy"),
        ("ece_primary_value", "ECE_primary"),
        ("ece_posthoc_value", "ECE_posthoc_lab"),
    ):
        bv = _f(base.get(key))
        cv = _f(cand.get(key))
        d = _delta(cv, bv)
        rows.append(
            {
                "metric": label,
                "key": key,
                "baseline": bv,
                "candidate": cv,
                "delta_candidate_minus_baseline": d,
            }
        )

    map_delta = _f(
        next(
            (
                r["delta_candidate_minus_baseline"]
                for r in rows
                if r["key"] == "test_map_at_3"
            ),
            None,
        )
    )
    deadly3_delta = _f(
        next(
            (
                r["delta_candidate_minus_baseline"]
                for r in rows
                if r["key"] == "safety_recall_deadly_at_3"
            ),
            None,
        )
    )
    ece_delta = _f(
        next(
            (
                r["delta_candidate_minus_baseline"]
                for r in rows
                if r["key"] == "ece_primary_value"
            ),
            None,
        )
    )

    map_crash = map_delta is not None and map_delta < MAP_CRASH
    deadly_crash = deadly3_delta is not None and deadly3_delta < DEADLY3_CRASH
    # ECE higher is worse
    ece_worse = ece_delta is not None and ece_delta > 0.02

    if map_crash or deadly_crash:
        status = "candidate_regression"
    elif map_delta is None and cand.get("test_map_at_3") is None:
        status = "GAP_incomplete_metrics"
        gaps.append("candidate_metrics_incomplete")
    else:
        status = "compared"

    advisory = {
        "map_crash_threshold": MAP_CRASH,
        "deadly3_crash_threshold": DEADLY3_CRASH,
        "map_crash": map_crash,
        "deadly3_crash": deadly_crash,
        "ece_primary_worse_by_gt_0_02": ece_worse,
        "note": (
            "Advisory lab signals only. Never product_unlock. "
            "MAP improvement is not safety. ECE primary remains train-published."
        ),
    }

    # Prefer dual deadly presence on both sides
    dual_ok = (
        base.get("safety_recall_deadly_at_1") is not None
        and base.get("safety_recall_deadly_at_3") is not None
        and cand.get("safety_recall_deadly_at_1") is not None
        and cand.get("safety_recall_deadly_at_3") is not None
    )
    if not dual_ok:
        gaps.append("dual_deadly_incomplete_on_one_side")

    if not base.get("ece_claim_train_published"):
        gaps.append("baseline_ece_not_claimed_train_published")
    if not cand.get("ece_claim_train_published"):
        gaps.append("candidate_ece_not_claimed_train_published")

    operator_action = (
        "Compared candidate vs E20 SSOT file. product_unlock=false. "
        "Continue lab loop frictions; do not auto-unlock; do not serve posthoc ECE."
    )
    if map_crash or deadly_crash:
        operator_action = (
            "Candidate shows advisory regression vs E20 SSOT on MAP and/or deadly@3. "
            "Keep product_unlock=false; prefer E20 baseline for serve; investigate train data."
        )

    return {
        "generated_at": _utc_now(),
        "status": status,
        "policy": POLICY,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "consumption_permission": False,
        "lab_only": True,
        "metrics_label": "[MEASURED]",
        "baseline_path": _repo_rel(baseline_path) or str(baseline_path),
        "candidate_path": _repo_rel(candidate_path) or str(candidate_path),
        "baseline": {
            "version": base.get("version"),
            "eval_protocol": base.get("eval_protocol"),
            "test_domain": base.get("test_domain"),
            "train_domain": base.get("train_domain"),
            "measured": {
                "test_map_at_3": base.get("test_map_at_3"),
                "safety_recall_deadly_at_1": base.get("safety_recall_deadly_at_1"),
                "safety_recall_deadly_at_3": base.get("safety_recall_deadly_at_3"),
                "n_deadly_in_test": base.get("n_deadly_in_test"),
                "test_accuracy": base.get("test_accuracy"),
            },
            "ece": {
                "primary": base.get("ece_primary_label"),
                "primary_value": base.get("ece_primary_value"),
                "primary_source": base.get("ece_primary_source"),
                "claim_train_published": base.get("ece_claim_train_published"),
                "posthoc_separate": True,
                "posthoc_value": base.get("ece_posthoc_value"),
            },
        },
        "candidate": {
            "version": cand.get("version"),
            "eval_protocol": cand.get("eval_protocol"),
            "test_domain": cand.get("test_domain"),
            "train_domain": cand.get("train_domain"),
            "measured": {
                "test_map_at_3": cand.get("test_map_at_3"),
                "safety_recall_deadly_at_1": cand.get("safety_recall_deadly_at_1"),
                "safety_recall_deadly_at_3": cand.get("safety_recall_deadly_at_3"),
                "n_deadly_in_test": cand.get("n_deadly_in_test"),
                "test_accuracy": cand.get("test_accuracy"),
            },
            "ece": {
                "primary": cand.get("ece_primary_label"),
                "primary_value": cand.get("ece_primary_value"),
                "primary_source": cand.get("ece_primary_source"),
                "claim_train_published": cand.get("ece_claim_train_published"),
                "posthoc_separate": True,
                "posthoc_value": cand.get("ece_posthoc_value"),
            },
        },
        "deltas": rows,
        "summary_deltas": {
            "map_at_3": map_delta,
            "deadly_at_1": _delta(
                _f(cand.get("safety_recall_deadly_at_1")),
                _f(base.get("safety_recall_deadly_at_1")),
            ),
            "deadly_at_3": deadly3_delta,
            "ece_primary": ece_delta,
        },
        "advisory": advisory,
        "dual_deadly_both_sides": dual_ok,
        "gaps": gaps,
        "operator_action": operator_action,
        "honesty": {
            "metrics_from_ssot_files_only": True,
            "dual_ece_primary": "train_published_when_proven",
            "posthoc_never_primary": True,
            "product_unlock_forced_false": True,
            "no_invented_metrics": True,
            "map_is_not_safety": True,
        },
        "never": [
            "auto product_unlock=true",
            "sell posthoc ECE as primary",
            "forage or consumption permission",
            "invent metrics",
            "pick max(MAP) across kernels for serve gate",
        ],
        "citation_rule": (
            "Copy full-precision [MEASURED] from baseline/candidate JSON files; "
            "do not round in PR titles."
        ),
        "note": (
            "Lab compare only. Orientation only. product_unlock forced false. "
            "Primary ECE channel is train-published; posthoc is separate."
        ),
    }


def render_md(report: dict[str, Any]) -> str:
    b = report.get("baseline") or {}
    c = report.get("candidate") or {}
    bm = b.get("measured") or {}
    cm = c.get("measured") or {}
    be = b.get("ece") or {}
    ce = c.get("ece") or {}
    sd = report.get("summary_deltas") or {}
    lines = [
        "# Loop compare to baseline (latest)",
        "",
        f"**Generated:** `{report.get('generated_at')}`  ",
        f"**Status:** `{report.get('status')}`  ",
        f"**product_unlock:** `{report.get('product_unlock')}` (forced false)  ",
        f"**Policy:** `{report.get('policy')}`",
        "",
        f"Baseline SSOT: `{report.get('baseline_path')}`  ",
        f"Candidate: `{report.get('candidate_path')}`",
        "",
        "## Operator action",
        "",
        str(report.get("operator_action") or ""),
        "",
        "## [MEASURED] side-by-side",
        "",
        "| Metric | Baseline E20 | Candidate | Δ (cand−base) |",
        "|--------|-------------:|----------:|--------------:|",
    ]
    for r in report.get("deltas") or []:
        bv = r.get("baseline")
        cv = r.get("candidate")
        dv = r.get("delta_candidate_minus_baseline")
        lines.append(
            f"| {r.get('metric')} | "
            f"{json.dumps(bv) if bv is not None else 'n/a'} | "
            f"{json.dumps(cv) if cv is not None else 'n/a'} | "
            f"{json.dumps(dv) if dv is not None else 'n/a'} |"
        )
    lines.extend(
        [
            "",
            "### Summary deltas",
            "",
            f"- MAP@3: `{sd.get('map_at_3')}`",
            f"- deadly@1: `{sd.get('deadly_at_1')}`",
            f"- deadly@3: `{sd.get('deadly_at_3')}`",
            f"- ECE primary: `{sd.get('ece_primary')}` (higher = worse calibration)",
            "",
            "## Dual ECE honesty",
            "",
            f"- Baseline primary: `{be.get('primary')}` = `{be.get('primary_value')}` "
            f"(claim_train_published=`{be.get('claim_train_published')}`)",
            f"- Candidate primary: `{ce.get('primary')}` = `{ce.get('primary_value')}` "
            f"(claim_train_published=`{ce.get('claim_train_published')}`)",
            f"- Baseline posthoc (lab): `{be.get('posthoc_value')}`",
            f"- Candidate posthoc (lab): `{ce.get('posthoc_value')}`",
            "",
            f"Versions: baseline `{b.get('version')}` · candidate `{c.get('version')}`  ",
            f"Protocols: baseline `{b.get('eval_protocol')}` · candidate `{c.get('eval_protocol')}`",
            "",
            "## Advisory",
            "",
            f"`{json.dumps(report.get('advisory'), ensure_ascii=False)}`",
            "",
        ]
    )
    gaps = report.get("gaps") or []
    if gaps:
        lines.extend(["## GAPs", ""])
        for g in gaps:
            lines.append(f"- `{g}`")
        lines.append("")
    lines.extend(
        [
            "---",
            "",
            "_Orientation only · never consumption · product_unlock=false_",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--baseline",
        type=Path,
        default=BASELINE_DEFAULT,
        help="E20 SSOT JSON path",
    )
    ap.add_argument(
        "--candidate",
        type=Path,
        default=None,
        help="Candidate metrics/suite/snapshot JSON",
    )
    ap.add_argument("--out-json", type=Path, default=OUT_JSON)
    ap.add_argument("--out-md", type=Path, default=OUT_MD)
    ap.add_argument(
        "--gate-regression",
        action="store_true",
        help="Exit 1 on candidate_regression status (default non-gating exit 0)",
    )
    args = ap.parse_args(argv)

    cand_path = resolve_candidate(args.candidate)
    report = compare(baseline_path=Path(args.baseline), candidate_path=cand_path)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    _write_json(out_json, report)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(render_md(report), encoding="utf-8")

    print(f"wrote {_repo_rel(out_json) or out_json}")
    print(f"wrote {_repo_rel(out_md) or out_md}")
    print(
        f"status={report.get('status')} product_unlock={report.get('product_unlock')} "
        f"summary={report.get('summary_deltas')}"
    )

    if args.gate_regression and report.get("status") == "candidate_regression":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
