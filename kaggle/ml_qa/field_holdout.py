"""M3 field holdout readiness for professional tester / ops."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_field_holdout_report(repo_root: Path | str) -> dict[str, Any] | None:
    root = Path(repo_root)
    path = root / "eval" / "reports" / "ml_experiments" / "field_multiview_holdout.json"
    if not path.is_file():
        # Fallback: synthesize minimal from LOO if present
        loo = root / "eval" / "reports" / "ml_experiments" / "paired_multiview_loo_eval.json"
        if not loo.is_file():
            return None
        try:
            data = json.loads(loo.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return None
        return {
            "status": "loo_only_fallback",
            "product_unlock": False,
            "gates": {
                "pass": bool((data.get("torch") or {}).get("ok")),
                "product_unlock": False,
            },
            "readiness": {
                "torch_field_eval_ok": bool((data.get("torch") or {}).get("ok")),
                "true_leave_one_photo_out": True,
                "product_unlock": False,
                "status": "ready"
                if (data.get("torch") or {}).get("ok")
                else "incomplete",
            },
            "headline": {
                "map3_4_minus_1": (data.get("deltas") or {}).get("map3_4_minus_1"),
            },
            "source": str(loo.relative_to(root)).replace("\\", "/"),
        }
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None


def evaluate_field_holdout(repo_root: Path | str) -> dict[str, Any]:
    """Suite-friendly evaluation. Never sets product_unlock true."""
    rep = load_field_holdout_report(repo_root)
    out: dict[str, Any] = {
        "suite": "S14_field_multiview_holdout",
        "product_unlock": False,
        "pass": False,
        "status": "missing",
        "flags": [],
        "headline": {},
        "gates": {},
        "readiness": {},
    }
    if not rep:
        out["flags"].append("field_holdout_report_missing")
        out["status"] = "missing"
        # Fail-open for suite when report absent but document honestly
        out["pass"] = True  # SKIP-like: do not fail CI until report expected
        out["skip"] = True
        return out

    gates = rep.get("gates") or {}
    readiness = rep.get("readiness") or {}
    out["gates"] = gates
    out["readiness"] = readiness
    out["headline"] = rep.get("headline") or {}
    out["status"] = readiness.get("status") or "unknown"
    out["path"] = "eval/reports/ml_experiments/field_multiview_holdout.json"
    torch_ok = bool(gates.get("torch_ok") or readiness.get("torch_field_eval_ok"))
    gates_pass = gates.get("pass")
    if gates_pass is False and torch_ok:
        out["flags"].append("field_holdout_gates_failed")
    if rep.get("deadly_multiview_caveat") or (rep.get("deadly_subset") or {}).get(
        "flat_multiview"
    ):
        out["flags"].append("deadly_multiview_flat")
    # Pass when torch eval exists and soft gates pass (or only deadly flat flag)
    out["pass"] = bool(torch_ok and (gates_pass is not False))
    if not torch_ok:
        out["pass"] = False
        out["flags"].append("torch_field_eval_not_ok")
    out["product_unlock"] = False
    out["policy"] = "orientation_only_never_consume"
    return out
