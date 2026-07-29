#!/usr/bin/env python3
"""Post-process E20 kernel_output_v20: honesty, dual deadly, unlock criteria.

Fail-closed: never sets product_unlock=True. Writes status + eval report.
Usage:
  python scripts/e20_postprocess.py
  python scripts/e20_postprocess.py --download
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

OUT = REPO / "kaggle" / "kernel_output_v20"
MODELS = OUT / "models"
STATUS = REPO / ".grok" / "graph-engineering" / "e20_run_status.json"
EVAL_OUT = REPO / "eval" / "reports" / "ml_experiments" / "e20_unlock_eval.json"
SLUG = "alonsoalviraaaa/visionsetil-exp-v20-source-holdout"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def download() -> int:
    MODELS.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [
            "kaggle",
            "kernels",
            "output",
            SLUG,
            "-p",
            str(OUT),
            "-o",
        ],
        cwd=str(REPO),
        capture_output=True,
        text=True,
    )
    # Flatten: Kaggle may dump files at OUT root or under models/
    for p in OUT.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() in {".json", ".pt", ".npz", ".log"}:
            # Prefer models/ for model artifacts
            if p.suffix.lower() in {".json", ".pt", ".npz"} and "models" not in p.parts:
                dest = MODELS / p.name
                if p.resolve() != dest.resolve():
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(p, dest)
    return r.returncode


def load_metrics() -> tuple[dict | None, Path | None]:
    candidates = [
        MODELS / "metrics.json",
        OUT / "metrics.json",
    ]
    for c in candidates:
        if c.is_file():
            try:
                return json.loads(c.read_text(encoding="utf-8")), c
            except (OSError, json.JSONDecodeError):
                continue
    return None, None


def recompute_dual_if_npz(metrics: dict) -> dict:
    """If test_predictions.npz present, recompute dual deadly and MAP@3 honesty."""
    import numpy as np

    from kaggle.ml_qa.metrics_core import deadly_recall_at_k, deadly_top1, map_at_k

    npz = MODELS / "test_predictions.npz"
    l2i_path = MODELS / "label2idx.json"
    deadly_path = REPO / "data" / "industrial_v1" / "deadly_set.json"
    out = dict(metrics)
    out["_honesty"] = {"recomputed": False}
    if not npz.is_file() or not l2i_path.is_file() or not deadly_path.is_file():
        out["_honesty"]["reason"] = "missing_npz_or_labels"
        return out

    z = np.load(npz, allow_pickle=True)
    probs, labels = z["probs"], z["labels"]
    l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
    deadly = json.loads(deadly_path.read_text(encoding="utf-8"))
    names = deadly if isinstance(deadly, list) else deadly.get("species") or deadly.get("latin_names") or []
    if names and isinstance(names[0], dict):
        names = [x.get("latin_name") or x.get("name") for x in names]
    deadly_idxs = {int(l2i[n]) for n in names if n and n in l2i}
    if not deadly_idxs:
        out["_honesty"]["reason"] = "no_deadly_idx_mapping"
        return out

    d1, n1 = deadly_top1(probs, labels, deadly_idxs)
    d3, n3 = deadly_recall_at_k(probs, labels, deadly_idxs, k=3)
    map3 = map_at_k(probs, labels, 3)
    declared_map = float(metrics.get("test_map_at_3") or -1)
    out["_honesty"] = {
        "recomputed": True,
        "map_at_3": map3,
        "deadly_at_1": d1,
        "deadly_at_3": d3,
        "n_deadly": n1,
        "map_match": abs(declared_map - map3) < 1e-3 if declared_map >= 0 else None,
        "dual_keys_present": (
            metrics.get("safety_recall_deadly_at_1") is not None
            and metrics.get("safety_recall_deadly_at_3") is not None
        ),
    }
    # Patch dual keys if missing (honest fill; preserve legacy)
    if metrics.get("safety_recall_deadly_at_1") is None:
        out["safety_recall_deadly_at_1"] = d1
    if metrics.get("safety_recall_deadly_at_3") is None:
        out["safety_recall_deadly_at_3"] = d3
        out["safety_recall_deadly_definition"] = "at_3"
    if metrics.get("n_deadly_in_test") is None:
        out["n_deadly_in_test"] = n1
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()

    if args.download:
        rc = download()
        print(f"download rc={rc}")

    metrics, path = load_metrics()
    honesty_metrics = recompute_dual_if_npz(metrics) if metrics else None

    from kaggle.ml_qa.gate_eval import evaluate_product_unlock_criteria

    unlock = evaluate_product_unlock_criteria(
        honesty_metrics,
        metrics_path=path,
    )
    # Hard policy
    unlock["product_unlock"] = False

    report = {
        "generated": _now(),
        "slug": SLUG,
        "metrics_path": str(path) if path else None,
        "has_metrics": metrics is not None,
        "honesty": (honesty_metrics or {}).get("_honesty"),
        "product_unlock": False,
        "unlock_eval": unlock,
        "note": "Orientation only — never consumption. Unlock requires operator cycle after E20.",
    }
    EVAL_OUT.parent.mkdir(parents=True, exist_ok=True)
    EVAL_OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    status = {
        "slug": SLUG,
        "checked_at": _now(),
        "has_metrics": metrics is not None,
        "product_unlock": False,
        "unlock_eligible_advisory": unlock.get("unlock_eligible_advisory"),
        "reasons": unlock.get("reasons"),
        "eval_report": str(EVAL_OUT),
    }
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    STATUS.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2)[:2000])
    return 0 if metrics else 2


if __name__ == "__main__":
    raise SystemExit(main())
