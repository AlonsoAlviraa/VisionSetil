#!/usr/bin/env python3
"""VisionSetil Image ML Loop — config-driven local evaluation cycle.

Wires ``kaggle/configs/image_ml_loop_v1.json`` into a reproducible cycle:
  1. Load loop config (backbone, metrics, bootstrap settings).
  2. Load kernel predictions (default: kaggle/kernel_output_v9/models).
  3. Run ``eval/scripts/compute_full_metrics.generate_full_report`` (real path).
  4. Emit metrics JSON + human transcript.

Usage:
    python scripts/run_image_ml_loop.py
    python scripts/run_image_ml_loop.py --config kaggle/configs/image_ml_loop_v1.json \\
        --predictions kaggle/kernel_output_v9/models/test_predictions.npz \\
        --output-dir eval/reports/ml_loop_v1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "eval" / "scripts"))
sys.path.insert(0, str(ROOT))

from compute_full_metrics import generate_full_report  # noqa: E402


def _load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _build_toxicity_db(idx2label: dict[int, str]) -> dict[str, str]:
    """Map species names → deadly|toxic|unknown using expanded catalog + poisonous list."""
    toxicity: dict[str, str] = {}
    expanded = ROOT / "backend" / "app" / "data" / "species_catalog_expanded.json"
    if expanded.exists():
        payload = json.loads(expanded.read_text(encoding="utf-8"))
        for row in payload.get("species") or []:
            taxon = str(row.get("taxon") or "")
            risk = str(row.get("risk_label") or "").lower()
            if risk == "deadly":
                toxicity[taxon] = "deadly"
            elif risk in {"poisonous", "toxic"}:
                toxicity[taxon] = "toxic"
            else:
                toxicity.setdefault(taxon, "unknown")
    pois = ROOT / "backend" / "app" / "data" / "poisonous_species.json"
    if pois.exists():
        for row in json.loads(pois.read_text(encoding="utf-8")):
            name = str(row.get("latin_name") or "")
            lvl = str(row.get("risk_level") or "").lower()
            if lvl in {"critical", "deadly"}:
                toxicity[name] = "deadly"
            elif lvl in {"high", "medium"}:
                toxicity.setdefault(name, "toxic")
    # Ensure every class has an entry
    for name in idx2label.values():
        toxicity.setdefault(name, "unknown")
    return toxicity


def _load_predictions(npz_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    data = np.load(npz_path, allow_pickle=True)
    probs = data["probs"]
    preds = data["preds"]
    labels = data["labels"]
    if "obs_ids" in data.files:
        obs_ids = data["obs_ids"].astype(str)
    else:
        # Image-level fallback: each row is its own observation (honest note in report).
        obs_ids = np.array([f"img_{i}" for i in range(len(labels))], dtype=str)
    return probs, preds, labels, obs_ids


def run_loop(
    config_path: Path,
    predictions: Path,
    label2idx_path: Path,
    output_dir: Path,
    transcript_path: Path | None = None,
) -> dict:
    config = _load_config(config_path)
    n_boot = int(config.get("bootstrap_iters") or 1000)

    lines: list[str] = []
    def log(msg: str = "") -> None:
        print(msg)
        lines.append(msg)

    log("=" * 72)
    log("VisionSetil Image ML Loop")
    log(f"config: {config_path}")
    log(f"name: {config.get('name')}")
    log(f"backbone: {config.get('backbone')}")
    log(f"predictions: {predictions}")
    log(f"bootstrap_iters: {n_boot}")
    log("=" * 72)

    probs, preds, labels, obs_ids = _load_predictions(predictions)
    with open(label2idx_path, encoding="utf-8") as f:
        label2idx = json.load(f)
    idx2label = {int(v): k for k, v in label2idx.items()}
    toxicity_db = _build_toxicity_db(idx2label)

    log(f"samples={len(labels)} classes={len(idx2label)} obs={len(np.unique(obs_ids))}")
    log(f"toxicity_db entries={len(toxicity_db)} deadly={sum(1 for v in toxicity_db.values() if v=='deadly')}")
    log("invoking compute_full_metrics.generate_full_report ...")

    # Patch bootstrap via generate_full_report internals (uses n_resamples=1000 hardcoded
    # inside generate_full_report → bootstrap_ci call). Report still uses 1000.
    report = generate_full_report(
        probs=probs,
        preds=preds,
        labels=labels,
        obs_ids=obs_ids,
        idx2label=idx2label,
        in_dist_mask=None,
        toxicity_db=toxicity_db,
        view_sets=None,
        output_dir=output_dir,
    )

    # Attach loop metadata
    report["loop"] = {
        "config_name": config.get("name"),
        "config_path": str(config_path),
        "predictions_path": str(predictions),
        "label2idx_path": str(label2idx_path),
        "obs_ids_mode": "from_npz" if "obs_ids" in np.load(predictions, allow_pickle=True).files else "synthetic_per_image",
        "kernel_metrics_reference": str(
            predictions.parent / "metrics.json"
        ),
    }

    # Merge reference kernel metrics (from training run) for comparison
    kernel_metrics_path = predictions.parent / "metrics.json"
    if kernel_metrics_path.exists():
        report["kernel_training_metrics"] = json.loads(
            kernel_metrics_path.read_text(encoding="utf-8")
        )

    out_json = output_dir / "image_ml_loop_metrics.json"
    out_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"wrote {out_json}")

    map3 = report.get("map_at_3") or {}
    clf = report.get("classification") or {}
    safety = report.get("safety") or {}
    log("")
    log("KEY METRICS")
    log(f"  MAP@3 point={map3.get('point')} CI95=[{map3.get('ci_low')}, {map3.get('ci_high')}]")
    log(f"  top1={clf.get('top1_acc')} top3={clf.get('top3_acc')} f1_macro={clf.get('f1_macro')}")
    log(f"  ECE={ (report.get('calibration') or {}).get('ece') }")
    log(f"  deadly_recall={safety.get('deadly_recall')} toxic_recall={safety.get('toxic_recall')}")
    if report.get("kernel_training_metrics"):
        km = report["kernel_training_metrics"]
        log(
            f"  kernel_ref MAP@3={km.get('test_map_at_3')} "
            f"CI=[{km.get('test_map_at_3_ci_low')}, {km.get('test_map_at_3_ci_high')}] "
            f"deadly_recall={km.get('safety_recall_deadly')}"
        )
    log("=" * 72)

    if transcript_path:
        transcript_path.parent.mkdir(parents=True, exist_ok=True)
        transcript_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Run VisionSetil image ML loop evaluation")
    parser.add_argument(
        "--config",
        default=str(ROOT / "kaggle" / "configs" / "image_ml_loop_v1.json"),
    )
    parser.add_argument(
        "--predictions",
        default=str(
            ROOT / "kaggle" / "kernel_output_v9" / "models" / "test_predictions.npz"
        ),
    )
    parser.add_argument(
        "--label2idx",
        default=str(ROOT / "kaggle" / "kernel_output_v9" / "models" / "label2idx.json"),
    )
    parser.add_argument(
        "--output-dir",
        default=str(ROOT / "eval" / "reports" / "ml_loop_v1"),
    )
    parser.add_argument(
        "--transcript",
        default=None,
        help="Optional path for human-readable run transcript",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    predictions = Path(args.predictions)
    label2idx = Path(args.label2idx)
    output_dir = Path(args.output_dir)
    transcript = Path(args.transcript) if args.transcript else output_dir / "metrics-run.log"

    if not config_path.exists():
        print(f"ERROR: config not found: {config_path}", file=sys.stderr)
        return 2
    if not predictions.exists():
        print(f"ERROR: predictions not found: {predictions}", file=sys.stderr)
        return 2
    if not label2idx.exists():
        print(f"ERROR: label2idx not found: {label2idx}", file=sys.stderr)
        return 2

    run_loop(config_path, predictions, label2idx, output_dir, transcript)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
