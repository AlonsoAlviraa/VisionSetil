import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Summarize evaluation metrics from report JSON.")
    parser.add_argument("--report", required=True, help="Path to report.json.")
    args = parser.parse_args()

    report_path = Path(args.report)
    if not report_path.exists():
        print(f"Error: report file {report_path} not found.")
        sys.exit(1)

    with open(report_path, encoding="utf-8") as f:
        data = json.load(f)

    metrics = data.get("metrics", {})
    status = data.get("model_status", {})
    phase6 = data.get("phase6_pipeline", {})

    print("==================================================")
    print("           VISIONSETIL EVALUATION SUMMARY         ")
    print("==================================================")
    print(f"Total Cases:          {metrics.get('total_cases')}")
    print(f"Evaluated Cases:      {metrics.get('evaluated_cases')}")
    print(f"Skipped Cases:        {metrics.get('skipped_cases')}")
    print("--------------------------------------------------")
    print(f"Top-1 Accuracy:       {metrics.get('species_top1_accuracy') * 100:.2f}%")
    print(f"Top-5 Accuracy:       {metrics.get('species_top5_accuracy') * 100:.2f}%")
    print(f"Genus Accuracy:       {metrics.get('genus_accuracy') * 100:.2f}%")
    print("--------------------------------------------------")
    print(f"Open-Set Rejection:   {metrics.get('open_set_rejection_rate') * 100:.2f}%")
    print(f"Human Review Rate:    {metrics.get('human_review_recommendation_rate') * 100:.2f}%")
    print(f"Unknown Fungus Rate:  {metrics.get('unknown_fungus_rate') * 100:.2f}%")
    print("--------------------------------------------------")
    print(f"False Safe Rate:      {metrics.get('false_safe_rate') * 100:.2f}% (Must be 0%)")
    print(f"Safety Violations:    {metrics.get('safety_policy_violations')}")
    print(f"Avg Latency:          {metrics.get('average_latency_ms')} ms")
    print("==================================================")
    print("Phase 6 Pipeline:")
    print(f"  - Valid: {phase6.get('valid')}")
    print(f"  - Ranker: {phase6.get('ranker')}")
    print(f"  - ML improvement: {phase6.get('ml_improvement')}")
    print(f"  - Catalog: {phase6.get('catalog')}")
    print(f"  - Similarity: {phase6.get('similarity')}")
    print(f"  - Open-set thresholds: {phase6.get('open_set_thresholds')}")
    print(f"  - Index path: {phase6.get('index_path')}")
    print(f"  - Thresholds path: {phase6.get('thresholds_path')}")
    print(f"  - Split manifest path: {phase6.get('split_manifest_path')}")
    print(f"  - Split overlap count: {phase6.get('split_manifest', {}).get('overlap_count')}")
    score_signals = phase6.get("score_signals", {})
    print(f"  - Cases with taxonomic score: {score_signals.get('cases_with_taxonomic_score')}")
    print(f"  - Mean taxonomic score: {score_signals.get('mean_taxonomic_score')}")
    print(f"  - Mean prototype quality: {score_signals.get('mean_prototype_quality')}")
    print(f"  - Cases with nonzero genus score: {score_signals.get('cases_with_nonzero_genus_score')}")
    print(f"  - Cases with nonzero family score: {score_signals.get('cases_with_nonzero_family_score')}")
    print("==================================================")

    # Print model backends
    print("Model Stack Configuration:")
    for k, v in status.items():
        print(f"  - {k}: {v.get('backend')} (Loaded: {v.get('loaded')}, Device: {v.get('device')})")
    print("==================================================")


if __name__ == "__main__":
    main()
