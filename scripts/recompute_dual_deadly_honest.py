#!/usr/bin/env python3
"""Recompute dual deadly@1/@3 on kernel metrics using industrial deadly_set + label2idx.

Fail-closed honesty: patches safety_recall_deadly_at_1 / _at_3 from npz.
Does not set product_unlock. Orientation only.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_deadly_idxs(models: Path) -> set[int] | None:
    l2i_path = models / "label2idx.json"
    deadly_path = ROOT / "data" / "industrial_v1" / "deadly_set.json"
    if not l2i_path.is_file() or not deadly_path.is_file():
        return None
    deadly = json.loads(deadly_path.read_text(encoding="utf-8"))
    names = deadly if isinstance(deadly, list) else deadly.get("species") or deadly.get(
        "latin_names"
    ) or []
    if names and isinstance(names[0], dict):
        names = [x.get("latin_name") or x.get("name") for x in names]
    l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
    return {int(l2i[n]) for n in names if n and n in l2i}


def main() -> None:
    from kaggle.ml_qa.metrics_core import recompute_all

    results = []
    for models in sorted((ROOT / "kaggle").glob("kernel_output_v*/models")):
        npz = models / "test_predictions.npz"
        metrics_path = models / "metrics.json"
        if not npz.is_file() or not metrics_path.is_file():
            continue
        di = load_deadly_idxs(models)
        if not di:
            results.append({"path": str(models), "status": "skip_no_deadly_idx"})
            continue
        z = np.load(npz, allow_pickle=True)
        probs, labels = z["probs"], z["labels"]
        rec = recompute_all(probs, labels, di, k=3)
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        backup = models / "metrics.pre_honest_industrial_dual.json"
        if not backup.exists():
            shutil.copy2(metrics_path, backup)
        metrics["safety_recall_deadly_at_1"] = rec["deadly_at_1"]
        metrics["safety_recall_deadly_at_3"] = rec["deadly_at_3"]
        # Preserve legacy key but annotate definition honestly
        metrics["safety_recall_deadly"] = rec["deadly_at_3"]
        metrics["safety_recall_deadly_definition"] = "at_3"
        metrics["n_deadly_eval"] = rec["n_deadly"]
        metrics["deadly_index_source"] = "industrial_v1/deadly_set.json+label2idx"
        metrics["honesty_dual_recompute_at"] = datetime.now(timezone.utc).isoformat()
        metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
        results.append(
            {
                "path": str(models.relative_to(ROOT)),
                "status": "patched",
                "deadly_at_1": rec["deadly_at_1"],
                "deadly_at_3": rec["deadly_at_3"],
                "n_deadly": rec["n_deadly"],
                "n_idx": len(di),
            }
        )
        print(json.dumps(results[-1]))
    out = ROOT / "eval/reports/ml_experiments/dual_deadly_honest_recompute.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"results": results}, indent=2) + "\n", encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main()
