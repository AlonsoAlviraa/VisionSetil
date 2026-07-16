#!/usr/bin/env python3
"""Calibrate open-set rejection thresholds from validation data.

Runs the classification pipeline on a held-out validation set and finds
optimal confidence/margin thresholds that maximize F1-score while keeping
a minimum safety margin for known species.

Outputs:
    - eval/reports/open_set_thresholds.json
    - eval/reports/calibration_report.txt

Usage:
    python scripts/calibrate_thresholds.py \
        --data-dir data/processed/df20_val \
        --species-index eval/species_index \
        --output-dir eval/reports
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calibrate open-set thresholds")
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="Validation dataset directory (species subfolders)",
    )
    parser.add_argument(
        "--species-index",
        type=Path,
        default=Path("eval/species_index"),
        help="Path to species index directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("eval/reports"),
        help="Output directory for reports",
    )
    parser.add_argument(
        "--max-images-per-species",
        type=int,
        default=10,
        help="Max validation images per species",
    )
    parser.add_argument(
        "--confidence-min",
        type=float,
        default=0.30,
        help="Minimum confidence threshold to sweep",
    )
    parser.add_argument(
        "--confidence-max",
        type=float,
        default=0.85,
        help="Maximum confidence threshold to sweep",
    )
    parser.add_argument(
        "--margin-min",
        type=float,
        default=0.05,
        help="Minimum margin threshold to sweep",
    )
    parser.add_argument(
        "--margin-max",
        type=float,
        default=0.40,
        help="Maximum margin threshold to sweep",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def discover_validation_images(
    data_dir: Path, max_per_species: int
) -> dict[str, list[Path]]:
    """Discover validation images per species."""
    valid_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    species_images: dict[str, list[Path]] = defaultdict(list)

    for species_dir in sorted(data_dir.iterdir()):
        if not species_dir.is_dir():
            continue
        species = species_dir.name
        images = [
            f for f in sorted(species_dir.iterdir()) if f.suffix.lower() in valid_extensions
        ]
        species_images[species] = images[:max_per_species]

    return dict(species_images)


def run_classification_batch(
    species_images: dict[str, list[Path]],
    verbose: bool = False,
) -> list[dict]:
    """Run classification on all validation images and collect raw scores."""
    from PIL import Image

    from app.core.config import settings
    from app.services.candidate_ranker import CandidateRanker

    ranker = CandidateRanker.from_settings(settings)
    results: list[dict] = []

    for species_name, image_paths in sorted(species_images.items()):
        for img_path in image_paths:
            try:
                img = Image.open(img_path).convert("RGB")
                candidates = ranker.rank(img, top_k=5)

                top1 = candidates[0] if candidates else {}
                top2 = candidates[1] if len(candidates) > 1 else {}

                results.append({
                    "true_species": species_name,
                    "predicted_species": top1.get("species", ""),
                    "confidence": top1.get("score", 0.0),
                    "margin": top1.get("score", 0.0) - top2.get("score", 0.0),
                    "candidates": [
                        {"species": c.get("species", ""), "score": c.get("score", 0.0)}
                        for c in candidates
                    ],
                })
            except Exception as e:
                if verbose:
                    print(f"  SKIP {img_path.name}: {e}")

    return results


def sweep_thresholds(
    results: list[dict],
    conf_min: float,
    conf_max: float,
    margin_min: float,
    margin_max: float,
    n_steps: int = 11,
) -> dict:
    """Sweep confidence/margin combinations and compute F1 at each point."""
    conf_range = [conf_min + (conf_max - conf_min) * i / (n_steps - 1) for i in range(n_steps)]
    margin_range = [
        margin_min + (margin_max - margin_min) * i / (n_steps - 1) for i in range(n_steps)
    ]

    best_f1 = 0.0
    best_thresholds: dict = {}
    sweep_data: list[dict] = []

    for conf_threshold in conf_range:
        for margin_threshold in margin_range:
            tp = fp = fn = tn = 0

            for r in results:
                true = r["true_species"]
                predicted = r["predicted_species"]
                confidence = r["confidence"]
                margin = r["margin"]

                is_known = true in {x["true_species"] for x in results}
                accepted = confidence >= conf_threshold and margin >= margin_threshold

                if is_known and accepted:
                    if predicted == true:
                        tp += 1
                    else:
                        fp += 1
                elif is_known and not accepted:
                    fn += 1
                elif not is_known and accepted:
                    fp += 1
                else:
                    tn += 1

            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
            accuracy = (tp + tn) / (tp + fp + fn + tn) if (tp + fp + fn + tn) > 0 else 0.0

            point = {
                "confidence_threshold": round(conf_threshold, 4),
                "margin_threshold": round(margin_threshold, 4),
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "tn": tn,
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "accuracy": round(accuracy, 4),
            }
            sweep_data.append(point)

            if f1 > best_f1:
                best_f1 = f1
                best_thresholds = point

    return {"best": best_thresholds, "sweep": sweep_data}


def generate_report(
    results: list[dict], calibration: dict, output_path: Path
) -> None:
    """Generate human-readable calibration report."""
    best = calibration["best"]
    lines = [
        "=" * 60,
        "VisionSetil — Open-Set Threshold Calibration Report",
        "=" * 60,
        "",
        f"Total validation samples: {len(results)}",
        f"Unique species: {len({r['true_species'] for r in results})}",
        "",
        "--- Best Thresholds (max F1) ---",
        f"  Confidence: {best['confidence_threshold']:.4f}",
        f"  Margin:     {best['margin_threshold']:.4f}",
        f"  F1:         {best['f1']:.4f}",
        f"  Precision:  {best['precision']:.4f}",
        f"  Recall:     {best['recall']:.4f}",
        f"  Accuracy:   {best['accuracy']:.4f}",
        f"  TP={best['tp']} FP={best['fp']} FN={best['fn']} TN={best['tn']}",
        "",
        "--- Confidence Distribution ---",
    ]

    confidences = sorted([r["confidence"] for r in results])
    if confidences:
        n = len(confidences)
        lines.append(f"  Min:    {confidences[0]:.4f}")
        lines.append(f"  25%:    {confidences[n // 4]:.4f}")
        lines.append(f"  Median: {confidences[n // 2]:.4f}")
        lines.append(f"  75%:    {confidences[3 * n // 4]:.4f}")
        lines.append(f"  Max:    {confidences[-1]:.4f}")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("VisionSetil — Open-Set Threshold Calibration")
    print("=" * 60)

    if not args.data_dir.exists():
        print(f"ERROR: Validation data not found: {args.data_dir}")
        sys.exit(1)

    # Discover images
    print(f"Discovering validation images in {args.data_dir}...")
    species_images = discover_validation_images(
        args.data_dir, args.max_images_per_species
    )
    total_images = sum(len(v) for v in species_images.values())
    print(f"  Found {len(species_images)} species, {total_images} images")

    if not species_images:
        print("ERROR: No images found.")
        sys.exit(1)

    # Run classification
    print(f"\nRunning classification on {total_images} images...")
    start_time = time.time()
    results = run_classification_batch(species_images, verbose=args.verbose)
    elapsed = time.time() - start_time
    print(f"  Completed in {elapsed:.1f}s ({len(results)}/{total_images} successful)")

    if not results:
        print("ERROR: No classification results.")
        sys.exit(1)

    # Sweep thresholds
    print("\nSweeping confidence/margin thresholds...")
    calibration = sweep_thresholds(
        results,
        args.confidence_min,
        args.confidence_max,
        args.margin_min,
        args.margin_max,
    )

    best = calibration["best"]
    print(f"\n  Best F1: {best['f1']:.4f}")
    print(f"  Confidence ≥ {best['confidence_threshold']:.4f}")
    print(f"  Margin     ≥ {best['margin_threshold']:.4f}")

    # Write outputs
    args.output_dir.mkdir(parents=True, exist_ok=True)

    thresholds_path = args.output_dir / "open_set_thresholds.json"
    thresholds_data = {
        "calibrated_threshold": best["confidence_threshold"],
        "calibrated_margin": best["margin_threshold"],
        "calibrated_f1": best["f1"],
        "calibrated_precision": best["precision"],
        "calibrated_recall": best["recall"],
        "calibrated_accuracy": best["accuracy"],
        "status": "calibrated",
        "samples": len(results),
        "species_count": len({r["true_species"] for r in results}),
        "calibration_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    thresholds_path.write_text(json.dumps(thresholds_data, indent=2), encoding="utf-8")
    print(f"\n  Thresholds → {thresholds_path}")

    report_path = args.output_dir / "calibration_report.txt"
    generate_report(results, calibration, report_path)
    print(f"  Report     → {report_path}")

    # Full sweep data
    sweep_path = args.output_dir / "calibration_sweep.json"
    sweep_path.write_text(
        json.dumps(calibration["sweep"], indent=2), encoding="utf-8"
    )

    print("\n✅ Calibration complete")


if __name__ == "__main__":
    main()
