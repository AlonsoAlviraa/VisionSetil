"""Calibrate real open-set rejection thresholds from benchmark predictions.

Computes cosine similarity distributions of correct vs incorrect cases and generates
dynamic thresholds to avoid sending 100% of cases to human review.

Usage:
    python eval/scripts/calibrate_open_set.py \
      --predictions /kaggle/working/visionsetil_outputs/real_report.json \
      --output /kaggle/working/visionsetil_outputs/open_set_thresholds.json
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def compute_percentile(sorted_values: list[float], percentile: float) -> float:
    """Compute the percentile of a sorted list of values."""
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * percentile
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)


def main():
    parser = argparse.ArgumentParser(description="Calibrate open-set rejection thresholds from benchmark predictions.")
    parser.add_argument("--predictions", required=True, help="Path to real_report.json from benchmark.")
    parser.add_argument("--output", required=True, help="Path to write calibrated thresholds JSON.")
    parser.add_argument("--target-rejection-rate", type=float, default=0.15,
                        help="Target rejection rate (default: 0.15 = 15%).")
    parser.add_argument("--min-threshold", type=float, default=0.25,
                        help="Minimum threshold value (default: 0.25).")
    parser.add_argument("--max-threshold", type=float, default=0.50,
                        help="Maximum threshold value (default: 0.50).")
    args = parser.parse_args()

    predictions_path = Path(args.predictions)
    output_path = Path(args.output)

    if not predictions_path.exists():
        print(f"ERROR: Predictions file not found: {predictions_path}", file=sys.stderr)
        sys.exit(1)

    with open(predictions_path, encoding="utf-8") as f:
        report_data = json.load(f)

    results = report_data.get("results", [])
    if not results:
        print("ERROR: No results found in report. Run the benchmark first.", file=sys.stderr)
        sys.exit(1)

    evaluated_results = [r for r in results if r.get("status") == "evaluated"]
    print(f"Calibrating open-set thresholds from {len(evaluated_results)} evaluated cases...")

    correct_confs = sorted([r.get("top1_confidence", 0.0) for r in evaluated_results if r.get("is_top1_hit")])
    wrong_confs = sorted([r.get("top1_confidence", 0.0) for r in evaluated_results if not r.get("is_top1_hit")])
    correct_margins = sorted([
        r.get("phase6_trace", {}).get("top1_margin", 0.0)
        for r in evaluated_results
        if r.get("is_top1_hit")
    ])
    wrong_margins = sorted([
        r.get("phase6_trace", {}).get("top1_margin", 0.0)
        for r in evaluated_results
        if not r.get("is_top1_hit")
    ])

    if not correct_confs:
        print("WARNING: No correct predictions found. Using default thresholds.", file=sys.stderr)
        calibrated_threshold = 0.35
        calibrated_margin = 0.03
    else:
        p5_correct = compute_percentile(correct_confs, 0.05)
        p10_correct = compute_percentile(correct_confs, 0.10)
        p25_correct = compute_percentile(correct_confs, 0.25)
        median_correct = compute_percentile(correct_confs, 0.50)

        p75_wrong = compute_percentile(wrong_confs, 0.75) if wrong_confs else 0.0
        p90_wrong = compute_percentile(wrong_confs, 0.90) if wrong_confs else 0.0
        median_wrong = compute_percentile(wrong_confs, 0.50) if wrong_confs else 0.0

        raw_threshold = p5_correct
        calibrated_threshold = max(args.min_threshold, min(args.max_threshold, round(raw_threshold, 4)))
        p5_correct_margin = compute_percentile(correct_margins, 0.05) if correct_margins else 0.03
        calibrated_margin = max(0.01, min(0.15, round(p5_correct_margin, 4)))

    rejections_at_threshold = sum(1 for r in evaluated_results
                                   if r.get("top1_confidence", 0.0) < calibrated_threshold
                                   or r.get("phase6_trace", {}).get("top1_margin", 0.0) < calibrated_margin)
    rejection_rate = round(rejections_at_threshold / len(evaluated_results), 4) if evaluated_results else 0.0

    correct_rejections = sum(1 for r in evaluated_results
                             if r.get("is_top1_hit") and (
                                 r.get("top1_confidence", 0.0) < calibrated_threshold
                                 or r.get("phase6_trace", {}).get("top1_margin", 0.0) < calibrated_margin
                             ))
    false_rejection_rate = round(correct_rejections / len(correct_confs), 4) if correct_confs else 0.0

    wrong_rejections = sum(1 for r in evaluated_results
                           if not r.get("is_top1_hit") and (
                               r.get("top1_confidence", 0.0) < calibrated_threshold
                               or r.get("phase6_trace", {}).get("top1_margin", 0.0) < calibrated_margin
                           ))
    true_rejection_rate = round(wrong_rejections / len(wrong_confs), 4) if wrong_confs else 0.0

    confidence_bins = Counter()
    for r in evaluated_results:
        c = r.get("top1_confidence", 0.0)
        bin_idx = min(int(c * 10), 9)
        confidence_bins[f"{bin_idx*0.1:.1f}-{(bin_idx+1)*0.1:.1f}"] += 1

    bin_accuracy = {}
    for bin_label in sorted(confidence_bins.keys()):
        bin_min = float(bin_label.split("-")[0])
        bin_max = float(bin_label.split("-")[1])
        bin_results = [r for r in evaluated_results
                       if bin_min <= r.get("top1_confidence", 0.0) < bin_max
                       or (bin_label.startswith("0.9") and r.get("top1_confidence", 0.0) >= 0.9)]
        if bin_results:
            correct = sum(1 for r in bin_results if r.get("is_top1_hit"))
            bin_accuracy[bin_label] = {
                "count": len(bin_results),
                "correct": correct,
                "accuracy": round(correct / len(bin_results), 4),
            }

    thresholds_report = {
        "status": "calibrated" if len(correct_confs) >= 20 else "insufficient_correct_predictions",
        "total_evaluated_cases": len(evaluated_results),
        "correct_predictions_count": len(correct_confs),
        "wrong_predictions_count": len(wrong_confs),
        "calibrated_threshold": calibrated_threshold,
        "calibrated_margin": calibrated_margin,
        "rejection_rate_at_threshold": rejection_rate,
        "false_rejection_rate": false_rejection_rate,
        "true_rejection_rate": true_rejection_rate,
        "target_rejection_rate": args.target_rejection_rate,
        "percentiles": {
            "correct_predictions": {
                "p5": round(p5_correct, 4) if correct_confs else 0.0,
                "p10": round(p10_correct, 4) if correct_confs else 0.0,
                "p25": round(p25_correct, 4) if correct_confs else 0.0,
                "median": round(median_correct, 4) if correct_confs else 0.0,
            },
            "wrong_predictions": {
                "p75": round(p75_wrong, 4) if wrong_confs else 0.0,
                "p90": round(p90_wrong, 4) if wrong_confs else 0.0,
                "median": round(median_wrong, 4) if wrong_confs else 0.0,
            },
        },
        "confidence_distribution": dict(confidence_bins),
        "accuracy_by_confidence_bin": bin_accuracy,
        "threshold_bounds": {
            "min": args.min_threshold,
            "max": args.max_threshold,
        },
        "margin_distribution": {
            "correct_p5": round(compute_percentile(correct_margins, 0.05), 4) if correct_margins else 0.0,
            "correct_median": round(compute_percentile(correct_margins, 0.50), 4) if correct_margins else 0.0,
            "wrong_median": round(compute_percentile(wrong_margins, 0.50), 4) if wrong_margins else 0.0,
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(thresholds_report, f, indent=2, ensure_ascii=False)

    md_path = output_path.with_suffix(".md")
    md_content = [
        "# Open-Set Calibration Report\n",
        "## Calibrated Thresholds\n",
        f"- **Confidence Threshold:** {calibrated_threshold:.4f}",
        f"- **Margin Threshold:** {calibrated_margin:.4f}",
        f"- **Rejection Rate at Threshold:** {rejection_rate*100:.2f}%",
        f"- **Target Rejection Rate:** {args.target_rejection_rate*100:.2f}%",
        f"- **False Rejection Rate (correct rejected):** {false_rejection_rate*100:.2f}%",
        f"- **True Rejection Rate (wrong rejected):** {true_rejection_rate*100:.2f}%\n",
        "## Prediction Distribution\n",
        f"- **Total Evaluated Cases:** {len(evaluated_results)}",
        f"- **Correct Predictions:** {len(correct_confs)}",
        f"- **Wrong Predictions:** {len(wrong_confs)}\n",
        "## Percentile Analysis\n",
        "### Correct Predictions Percentiles\n",
        f"- P5: {thresholds_report['percentiles']['correct_predictions']['p5']:.4f}",
        f"- P10: {thresholds_report['percentiles']['correct_predictions']['p10']:.4f}",
        f"- P25: {thresholds_report['percentiles']['correct_predictions']['p25']:.4f}",
        f"- Median: {thresholds_report['percentiles']['correct_predictions']['median']:.4f}\n",
        "### Wrong Predictions Percentiles\n",
        f"- Median: {thresholds_report['percentiles']['wrong_predictions']['median']:.4f}",
        f"- P75: {thresholds_report['percentiles']['wrong_predictions']['p75']:.4f}",
        f"- P90: {thresholds_report['percentiles']['wrong_predictions']['p90']:.4f}\n",
        "## Accuracy by Confidence Bin\n",
        "| Bin | Count | Correct | Accuracy |",
        "| --- | --- | --- | --- |",
    ]

    for bin_label, bin_data in sorted(bin_accuracy.items()):
        md_content.append(f"| {bin_label} | {bin_data['count']} | {bin_data['correct']} | {bin_data['accuracy']*100:.2f}% |")

    md_content.append("\n## Usage\n")
    md_content.append("To re-run the benchmark with calibrated thresholds:\n")
    md_content.append("```bash")
    md_content.append("python kaggle/run_large_dataset_benchmark.py \\")
    md_content.append("  --config kaggle/configs/fungiclef2025_1000_real_models_config.json \\")
    md_content.append("  --max-cases 1000 \\")
    md_content.append("  --ranker candidate_ranker_v2 \\")
    md_content.append(f"  --open-set-thresholds {output_path}")
    md_content.append("```")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_content))

    print(f"Open-set thresholds written to {output_path}")
    print(f"Open-set calibration markdown written to {md_path}")
    print(f"\nCalibrated Threshold: {calibrated_threshold:.4f}")
    print(f"Calibrated Margin: {calibrated_margin:.4f}")
    print(f"Rejection Rate: {rejection_rate*100:.2f}%")
    print(f"False Rejection Rate: {false_rejection_rate*100:.2f}%")
    print(f"True Rejection Rate: {true_rejection_rate*100:.2f}%")


if __name__ == "__main__":
    main()
