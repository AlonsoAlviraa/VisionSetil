"""Audit kernel model artifacts for metric honesty and optional split files."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import numpy as np

from kaggle.ml_qa.metrics_core import deadly_top1, map_at_k, recompute_all


def _load_json(path: Path) -> Optional[dict]:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _load_obs_ids(path: Path) -> Optional[set[str]]:
    data = _load_json(path)
    if data is None:
        return None
    # list of dicts or {"observations": [...]}
    rows = data if isinstance(data, list) else data.get("observations") or data.get("rows")
    if not isinstance(rows, list):
        return None
    out = set()
    for r in rows:
        if isinstance(r, dict) and r.get("observation_id") is not None:
            out.add(str(r["observation_id"]))
    return out


def _resolve_deadly_idxs(models_dir: Path) -> Optional[set[int]]:
    """Map industrial deadly scientific names → class indices via label2idx."""
    l2i_path = models_dir / "label2idx.json"
    # repo root: kaggle/ml_qa -> parents[2]
    deadly_path = Path(__file__).resolve().parents[2] / "data" / "industrial_v1" / "deadly_set.json"
    if not l2i_path.is_file() or not deadly_path.is_file():
        return None
    try:
        deadly = json.loads(deadly_path.read_text(encoding="utf-8"))
        names = (
            deadly
            if isinstance(deadly, list)
            else deadly.get("species") or deadly.get("latin_names") or []
        )
        if names and isinstance(names[0], dict):
            names = [x.get("latin_name") or x.get("name") for x in names]
        l2i = json.loads(l2i_path.read_text(encoding="utf-8"))
        idxs = {int(l2i[n]) for n in names if n and n in l2i}
        return idxs or None
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None


def audit_models_dir(
    models_dir: Path,
    deadly_idxs: Optional[set[int]] = None,
    atol: float = 1e-3,
) -> dict[str, Any]:
    """Audit one kernel models/ directory."""
    models_dir = Path(models_dir)
    report: dict[str, Any] = {
        "path": str(models_dir),
        "pass": True,
        "status": "ok",
        "checks": {},
        "flags": [],
    }
    metrics_path = models_dir / "metrics.json"
    npz_path = models_dir / "test_predictions.npz"
    metrics = _load_json(metrics_path)
    report["checks"]["metrics_json"] = metrics is not None
    if metrics is None:
        report["pass"] = False
        report["status"] = "missing_metrics"
        report["flags"].append("no metrics.json")
        return report

    declared_map = metrics.get("test_map_at_3")
    declared_deadly = metrics.get("safety_recall_deadly")
    report["declared"] = {
        "test_map_at_3": declared_map,
        "safety_recall_deadly": declared_deadly,
        "safety_recall_deadly_at_3": metrics.get("safety_recall_deadly_at_3"),
        "databases_used": metrics.get("databases_used"),
        "version": metrics.get("version"),
    }

    if npz_path.is_file():
        z = np.load(npz_path, allow_pickle=True)
        probs = z["probs"]
        labels = z["labels"]
        preds = z["preds"] if "preds" in z.files else probs.argmax(axis=1)
        n_cls = probs.shape[1]
        resolved = deadly_idxs if deadly_idxs is not None else _resolve_deadly_idxs(models_dir)
        d_idx = resolved if resolved is not None else set(range(min(11, n_cls)))
        report["checks"]["deadly_idxs_source"] = (
            "caller"
            if deadly_idxs is not None
            else ("industrial_label2idx" if resolved is not None else "fallback_range11")
        )
        recomputed = recompute_all(probs, labels, d_idx, k=3)
        d1_from_preds, n_d = deadly_top1(probs, labels, d_idx)
        report["recomputed"] = recomputed
        report["recomputed"]["deadly_top1_from_preds"] = d1_from_preds

        if declared_map is not None:
            map_ok = abs(float(declared_map) - recomputed["map_at_k"]) <= atol
            report["checks"]["map_matches_npz"] = map_ok
            if not map_ok:
                report["flags"].append(
                    f"MAP@3 mismatch declared={declared_map} recomputed={recomputed['map_at_k']}"
                )
                report["pass"] = False

        # Detect E19-style mislabel: safety_recall_deadly ≈ top1 but much lower than @3
        if declared_deadly is not None and n_d > 0:
            close_top1 = abs(float(declared_deadly) - d1_from_preds) <= 0.02
            far_from_at3 = abs(float(declared_deadly) - recomputed["deadly_at_3"]) > 0.02
            if close_top1 and far_from_at3:
                report["flags"].append(
                    "SUSPECT: safety_recall_deadly matches deadly top-1, not @3 "
                    f"(top1={d1_from_preds:.4f} at3={recomputed['deadly_at_3']:.4f} "
                    f"declared={float(declared_deadly):.4f})"
                )
                report["checks"]["deadly_field_is_at3"] = False
                report["status"] = "suspect_metric_naming"
            else:
                report["checks"]["deadly_field_is_at3"] = True
                if metrics.get("safety_recall_deadly_at_3") is not None:
                    v = float(metrics["safety_recall_deadly_at_3"])
                    if abs(v - recomputed["deadly_at_3"]) > atol:
                        report["flags"].append("safety_recall_deadly_at_3 mismatch vs npz")
                        report["pass"] = False
    else:
        report["checks"]["npz"] = False
        report["flags"].append("no test_predictions.npz — skip recompute")

    # Split artifacts
    train_ids = _load_obs_ids(models_dir / "train_obs.json")
    val_ids = _load_obs_ids(models_dir / "val_obs.json")
    test_ids = _load_obs_ids(models_dir / "test_obs.json")
    if train_ids is not None and test_ids is not None:
        leak_tt = train_ids & test_ids
        leak_tv = (train_ids & val_ids) if val_ids else set()
        leak_vt = (val_ids & test_ids) if val_ids else set()
        report["checks"]["split_artifacts"] = True
        report["split_leak"] = {
            "train_test": len(leak_tt),
            "train_val": len(leak_tv),
            "val_test": len(leak_vt),
        }
        if leak_tt or leak_tv or leak_vt:
            report["pass"] = False
            report["flags"].append(f"LEAK in persisted obs ids: {report['split_leak']}")
    else:
        report["checks"]["split_artifacts"] = False
        report["flags"].append("no train/test_obs.json (UNKNOWN offline re-audit)")

    if report["flags"] and report["status"] == "ok":
        report["status"] = "flagged" if report["pass"] else "fail"
    return report


def audit_all_kernel_outputs(
    repo: Path,
    pattern: str = "kernel_output_v*",
) -> list[dict[str, Any]]:
    root = Path(repo) / "kaggle"
    results = []
    for d in sorted(root.glob(pattern)):
        models = d / "models"
        if models.is_dir() and (models / "metrics.json").is_file():
            results.append(audit_models_dir(models))
    return results
