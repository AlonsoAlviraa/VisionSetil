#!/usr/bin/env python3
"""E21 scale readiness — baseline gates from E20 only; never launches Kaggle; never unlocks.

Usage:
  python scripts/e21_readiness.py
  python scripts/e21_readiness.py --write
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

POLICY = "orientation_only_never_consume"
SOFT_MAP = 0.25
SOFT_DEADLY = 0.90
REPORT_DIR = ROOT / "eval" / "reports" / "ml_experiments"
DEFAULT_METRICS = ROOT / "kaggle" / "kernel_output_v20" / "models" / "metrics.json"
DEFAULT_BEST = ROOT / "kaggle" / "kernel_output_v20" / "models" / "best.pt"
DEFAULT_NPZ = ROOT / "kaggle" / "kernel_output_v20" / "models" / "test_predictions.npz"
DEFAULT_PLAN = ROOT / "docs" / "E21_SCALE_PLAN.md"


def _load_metrics(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def evaluate_e21_readiness(
    *,
    metrics_path: Path | None = None,
    best_pt: Path | None = None,
    npz_path: Path | None = None,
    plan_path: Path | None = None,
) -> dict:
    """Assess whether E20 baseline is ready as foundation for optional E21.

    Always product_unlock=False. Never starts a kernel.
    """
    mpath = Path(metrics_path or DEFAULT_METRICS)
    bpath = Path(best_pt or DEFAULT_BEST)
    npath = Path(npz_path or DEFAULT_NPZ)
    ppath = Path(plan_path or DEFAULT_PLAN)
    metrics = _load_metrics(mpath)

    map3 = metrics.get("test_map_at_3")
    d1 = metrics.get("safety_recall_deadly_at_1")
    d3 = metrics.get("safety_recall_deadly_at_3")
    n_deadly = metrics.get("n_deadly") or metrics.get("n_deadly_in_test") or 0
    version = metrics.get("version") or ""

    checks = {
        "metrics_present": bool(metrics),
        "e20_or_holdout_version": bool(version) and (
            "v20" in str(version).lower()
            or "e20" in str(version).lower()
            or "source_holdout" in str(version).lower()
            or "holdout" in str(metrics.get("protocol") or "").lower()
        ),
        "dual_deadly_keys": d1 is not None and d3 is not None,
        "soft_map": isinstance(map3, (int, float)) and float(map3) >= SOFT_MAP,
        "soft_deadly_at_3": isinstance(d3, (int, float)) and float(d3) >= SOFT_DEADLY,
        "n_deadly_nonzero": int(n_deadly or 0) > 0 or (
            isinstance(d3, (int, float)) and float(d3) > 0
        ),
        "best_pt_present": bpath.is_file(),
        "predictions_npz_present": npath.is_file(),
        "e21_plan_doc_present": ppath.is_file(),
    }
    # If version string missing but path is kernel_output_v20, still count as e20 baseline
    if not checks["e20_or_holdout_version"] and "kernel_output_v20" in str(mpath).replace("\\", "/"):
        checks["e20_or_holdout_version"] = checks["metrics_present"]

    fail_reasons = [k for k, ok in checks.items() if not ok]
    ready = all(checks.values())

    out = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "policy": POLICY,
        "experiment": "e21_scale_holdout_optional",
        "status": "ready_for_operator_schedule" if ready else "blocked_on_baseline",
        "e21_launched": False,
        "kaggle_push": False,
        "product_unlock": False,
        "can_auto_unlock": False,
        "forage_permission": False,
        "baseline": {
            "metrics_path": str(mpath),
            "best_pt": str(bpath),
            "npz": str(npath),
            "version": version,
            "test_map_at_3": map3,
            "safety_recall_deadly_at_1": d1,
            "safety_recall_deadly_at_3": d3,
            "n_deadly": n_deadly,
            "protocol": metrics.get("protocol"),
        },
        "thresholds": {"soft_map": SOFT_MAP, "soft_deadly_at_3": SOFT_DEADLY},
        "checks": checks,
        "fail_reasons": fail_reasons,
        "ready_for_e21_schedule": ready,
        "operator_action": (
            "baseline_ok: schedule GPU only when class expansion + datasets ready; "
            "never auto-unlock; re-verify holdout after E21 COMPLETE"
            if ready
            else "fix_baseline_checks_before_any_e21_kernel"
        ),
        "plan_doc": str(ppath),
        "note": (
            "E21 is optional scale. This script never pushes Kaggle and never sets "
            "product_unlock true. Orientation only — never consumption."
        ),
    }
    # Fail-closed re-assert
    out["product_unlock"] = False
    out["can_auto_unlock"] = False
    out["e21_launched"] = False
    out["kaggle_push"] = False
    return out


def write_report(payload: dict, path: Path | None = None) -> Path:
    out_path = path or (REPORT_DIR / "e21_readiness.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out_path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="E21 readiness (no Kaggle push, no unlock)")
    ap.add_argument("--write", action="store_true", help="Write e21_readiness.json")
    ap.add_argument("--metrics", type=Path, default=None)
    args = ap.parse_args(argv)
    payload = evaluate_e21_readiness(metrics_path=args.metrics)
    if args.write:
        p = write_report(payload)
        print(f"wrote {p}")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    # exit 0 even if not ready — informational; never unlocks
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
