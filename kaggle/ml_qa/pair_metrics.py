"""Lookalike pair metrics suite for professional tester.

Uses curated SSOT pairs only (never invents pairs). When local
test_predictions.npz + label2idx are available, reports mate-in-top-k
confusion signal on the holdout predictions. Catalog health is always scored.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from eval.scripts.lookalike_pair_metrics import load_pairs, pair_error_rate  # noqa: E402


def _prefer_models_dirs(repo: Path) -> list[Path]:
    """Newest experiment dirs first (v20 → v19 → …)."""
    kaggle = repo / "kaggle"
    found: list[tuple[int, Path]] = []
    if not kaggle.is_dir():
        return []
    for p in kaggle.glob("kernel_output_v*/models"):
        if not p.is_dir():
            continue
        # extract version number for sort; v16_live → 16
        name = p.parent.name  # kernel_output_v19
        digits = "".join(ch if ch.isdigit() else " " for ch in name.split("_v", 1)[-1])
        ver = int(digits.split()[0]) if digits.strip() else 0
        found.append((ver, p))
    found.sort(key=lambda t: t[0], reverse=True)
    return [p for _, p in found]


def resolve_predictions_dir(repo: Path, preferred: Path | None = None) -> Path | None:
    if preferred is not None:
        p = Path(preferred)
        if (p / "test_predictions.npz").is_file() and (p / "label2idx.json").is_file():
            return p
    for d in _prefer_models_dirs(repo):
        if (d / "test_predictions.npz").is_file() and (d / "label2idx.json").is_file():
            return d
    return None


def label2idx_to_idx2label(l2i: dict) -> dict[int, str]:
    # label2idx is usually {name: int}
    sample_val = next(iter(l2i.values()), None)
    if isinstance(sample_val, int) or (isinstance(sample_val, str) and str(sample_val).isdigit()):
        return {int(v): str(k) for k, v in l2i.items()}
    # already idx → name
    return {int(k): str(v) for k, v in l2i.items()}


def run_pair_metrics_suite(
    repo: Path | None = None,
    *,
    models_dir: Path | None = None,
    k: int = 3,
) -> dict[str, Any]:
    """Run catalog + optional prediction pair metrics.

    Returns a professional-tester suite dict with status PASS/FAIL/SKIP.
    Soft: missing predictions → PASS with flag (catalog still required).
    Hard fail: catalog empty or load error.
    """
    repo = Path(repo or ROOT)
    flags: list[str] = []
    try:
        pairs = load_pairs()
    except Exception as exc:  # pragma: no cover
        return {
            "name": "S5 lookalike pair metrics",
            "status": "FAIL",
            "detail": f"load_pairs failed: {exc}",
            "flags": ["pair_catalog_load_failed"],
            "metrics": {},
        }

    n_pairs = len(pairs)
    catalog_ok = n_pairs >= 20
    if not catalog_ok:
        flags.append(f"too_few_directed_pairs:{n_pairs}")

    pred_dir = resolve_predictions_dir(repo, models_dir)
    metrics: dict[str, Any] = {
        "n_directed_pairs": n_pairs,
        "k": k,
        "predictions_dir": str(pred_dir) if pred_dir else None,
    }

    if pred_dir is None:
        flags.append("no_local_predictions_skip_confusion")
        status = "PASS" if catalog_ok else "FAIL"
        return {
            "name": "S5 lookalike pair metrics",
            "status": status,
            "detail": json.dumps(
                {"n_directed_pairs": n_pairs, "predictions": None},
                ensure_ascii=False,
            ),
            "flags": flags,
            "metrics": metrics,
        }

    try:
        z = np.load(pred_dir / "test_predictions.npz", allow_pickle=True)
        probs = z["probs"]
        labels = z["labels"]
        l2i = json.loads((pred_dir / "label2idx.json").read_text(encoding="utf-8"))
        idx2label = label2idx_to_idx2label(l2i)
        report = pair_error_rate(labels, probs, idx2label, pairs, k=k)
        metrics.update(report)
        n_in_space = int(report.get("n_pairs_in_label_space") or 0)
        if n_in_space < 5:
            flags.append(f"few_pairs_in_label_space:{n_in_space}")
        # confusion signal is informational; do not hard-fail on high mate rate
        status = "PASS" if catalog_ok else "FAIL"
        detail = {
            "n_directed_pairs": n_pairs,
            "n_pairs_in_label_space": n_in_space,
            "n_eval_samples": report.get("n_eval_samples"),
            "true_in_topk_rate": report.get("true_in_topk_rate"),
            "lookalike_mate_in_topk_rate": report.get("lookalike_mate_in_topk_rate"),
            "predictions_dir": str(pred_dir),
        }
        return {
            "name": "S5 lookalike pair metrics",
            "status": status,
            "detail": json.dumps(detail, ensure_ascii=False),
            "flags": flags,
            "metrics": metrics,
        }
    except Exception as exc:
        flags.append(f"pair_eval_error:{exc}")
        return {
            "name": "S5 lookalike pair metrics",
            "status": "FAIL",
            "detail": f"eval failed on {pred_dir}: {exc}",
            "flags": flags,
            "metrics": metrics,
        }
