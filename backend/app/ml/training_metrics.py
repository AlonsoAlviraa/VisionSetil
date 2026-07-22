"""Load on-disk training metrics / history for dashboard honesty.

Never invents MAP@3 or accuracy — only reads JSON artifacts under the monorepo
(kaggle/kernel_output_*/models/).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _repo_root(explicit: Path | str | None = None) -> Path:
    if explicit is not None:
        return Path(explicit).resolve()
    # backend/app/ml/training_metrics.py → parents[3] = monorepo root
    return Path(__file__).resolve().parents[3]


def discover_metrics_artifacts(repo_root: Path | str | None = None) -> list[dict[str, Any]]:
    """Find metrics.json (+ optional history) under kaggle/kernel_output*/models/."""
    root = _repo_root(repo_root)
    models_dirs = sorted(root.glob("kaggle/kernel_output*/models"))
    found: list[dict[str, Any]] = []
    for models in models_dirs:
        metrics_path = models / "metrics.json"
        if not metrics_path.is_file():
            continue
        try:
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            found.append(
                {
                    "run": models.parent.name,
                    "metrics_path": str(metrics_path),
                    "error": f"{exc.__class__.__name__}: {exc}",
                }
            )
            continue
        history = None
        history_path = models / "training_history.json"
        if history_path.is_file():
            try:
                history = json.loads(history_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                history = None
        label2idx_path = models / "label2idx.json"
        n_labels = None
        if label2idx_path.is_file():
            try:
                n_labels = len(json.loads(label2idx_path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError, TypeError):
                n_labels = None
        best_pt = models / "best.pt"
        found.append(
            {
                "run": models.parent.name,
                "metrics_path": str(metrics_path),
                "history_path": str(history_path) if history_path.is_file() else None,
                "weights_best_exists": best_pt.is_file(),
                "weights_best_path": str(best_pt) if best_pt.is_file() else None,
                "metrics": metrics if isinstance(metrics, dict) else {"raw": metrics},
                "history_len": len(history) if isinstance(history, list) else 0,
                "history_tail": history[-3:] if isinstance(history, list) else None,
                "label2idx_count": n_labels,
            }
        )
    # Prefer latest v9-style first
    found.sort(key=lambda x: x.get("run") or "", reverse=True)
    return found


def describe_training_metrics(repo_root: Path | str | None = None) -> dict[str, Any]:
    """Dashboard-friendly dict: primary run + all discovered artifacts + sources registry."""
    root = _repo_root(repo_root)
    artifacts = discover_metrics_artifacts(root)
    primary = artifacts[0] if artifacts else None
    registry_path = root / "data" / "training_sources_registry.json"
    registry: dict[str, Any] | None = None
    if registry_path.is_file():
        try:
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            registry = None

    gbif_probe_path = root / "data" / "gbif_probe_latest.json"
    gbif_probe = None
    if gbif_probe_path.is_file():
        try:
            gbif_probe = json.loads(gbif_probe_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            gbif_probe = None

    metrics = (primary or {}).get("metrics") if primary else None
    summary_line = None
    if isinstance(metrics, dict):
        map3 = metrics.get("test_map_at_3")
        acc = metrics.get("test_accuracy")
        n_cls = metrics.get("num_classes")
        summary_line = (
            f"MAP@3={map3} · acc={acc} · classes={n_cls} · "
            f"run={(primary or {}).get('run')}"
        )

    return {
        "primary": primary,
        "runs": artifacts,
        "run_count": len(artifacts),
        "summary_line": summary_line,
        "sources_registry_path": str(registry_path) if registry_path.is_file() else None,
        "sources_registry": {
            "updated": (registry or {}).get("updated"),
            "current_checkpoint": (registry or {}).get("current_checkpoint"),
            "ml_ready_public_ids": [
                s.get("id") for s in (registry or {}).get("ml_ready_public") or []
            ],
            "request_collaboration_ids": [
                s.get("id") for s in (registry or {}).get("request_collaboration") or []
            ],
            "gbif_probe_snapshot": (registry or {}).get("gbif_probe_snapshot"),
        }
        if registry
        else None,
        "gbif_probe_live_file": gbif_probe,
        "docs": "docs/DATA_SOURCES_SPAIN_SORIA.md",
        "honesty": (
            "metrics_from_disk"
            if primary and not primary.get("error")
            else "no_metrics_artifact"
        ),
    }
