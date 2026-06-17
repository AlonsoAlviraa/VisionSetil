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

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    metrics = data.get("metrics", {})
    status = data.get("model_status", {})

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
    
    # Print model backends
    print("Model Stack Configuration:")
    for k, v in status.items():
        print(f"  - {k}: {v.get('backend')} (Loaded: {v.get('loaded')}, Device: {v.get('device')})")
    print("==================================================")


if __name__ == "__main__":
    main()
