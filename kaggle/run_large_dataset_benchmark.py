import argparse
import json
import os
import random
import sys
import subprocess
import time
import shutil
from pathlib import Path

# Add project root and backend to sys.path
root_dir = Path(__file__).resolve().parents[1]
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

# Import converters
from kaggle.converters import convert_fungiclef, convert_fungitastic, convert_df20
from kaggle.converters.common import HIGH_RISK_GENERA

def print_memory_stats(clear_cache=False):
    print("--------------------------------------------------")
    print("Runtime Resource Status:")
    try:
        import psutil
        process = psutil.Process(os.getpid())
        ram_mb = process.memory_info().rss / (1024 * 1024)
        print(f"  - RAM Usage: {ram_mb:.2f} MB")
    except ImportError:
        print("  - RAM Usage: psutil not installed")

    try:
        import torch
        if torch.cuda.is_available():
            print(f"  - CUDA Available: True")
            print(f"  - Current Device: {torch.cuda.get_device_name(0)}")
            if clear_cache:
                torch.cuda.empty_cache()
                print("  - CUDA cache cleared.")
            allocated = torch.cuda.memory_allocated(0) / (1024 * 1024)
            cached = torch.cuda.memory_reserved(0) / (1024 * 1024)
            print(f"  - CUDA Allocated: {allocated:.2f} MB")
            print(f"  - CUDA Reserved: {cached:.2f} MB")
        else:
            print("  - CUDA Available: False")
    except Exception as e:
        print(f"  - GPU Info error: {e}")
    print("--------------------------------------------------")

def main():
    parser = argparse.ArgumentParser(description="VisionSetil Large Dataset Kaggle Benchmark.")
    parser.add_argument("--config", help="Path to config JSON (optional)")
    parser.add_argument("--dataset-name", help="Dataset name (fungiclef2025, fungitastic, df20)")
    parser.add_argument("--dataset-root", help="Path to raw dataset directory")
    parser.add_argument("--output-dir", help="Path to write benchmark reports")
    parser.add_argument("--max-cases", type=int, help="Override maximum cases to evaluate")
    parser.add_argument("--shuffle", action="store_true", help="Shuffle dataset before running")
    parser.add_argument("--seed", type=int, help="Seed for shuffle reproducibility")
    parser.add_argument("--risk-balanced", action="store_true", help="Prioritize balanced risk cases")
    parser.add_argument("--genus-balanced", action="store_true", help="Prioritize balanced genus cases")
    parser.add_argument("--include-dangerous-genera", action="store_true", help="Prioritize high risk genera")
    parser.add_argument("--cpu-only", action="store_true", help="Force execution on CPU")
    parser.add_argument("--debug-safety", action="store_true", help="Enable safety auditor debug details")
    parser.add_argument("--max-safety-debug-cases", type=int, help="Max cases to show in safety debug")
    parser.add_argument("--mode", default="full_pipeline", choices=["full_pipeline", "convert_only", "siglip_embeddings_only", "fusion_eval_only"], help="Execution mode")
    args = parser.parse_args()

    # 1. Load config if provided, else use defaults
    config = {}
    if args.config:
        config_path = Path(args.config)
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
        else:
            print(f"Warning: Config file not found at {config_path}. Using CLI parameters.")

    # Apply defaults/overrides
    dataset_name = args.dataset_name or config.get("dataset_name", "fungiclef2025")
    dataset_root = args.dataset_root or config.get("dataset_root", "/kaggle/input/fungi-clef-2025")
    output_dir = Path(args.output_dir or config.get("output_dir", "/kaggle/working/visionsetil_outputs"))
    converted_dataset_path = Path(config.get("converted_dataset_path", output_dir / f"converted_{dataset_name}_observations.json"))
    cpu_only = args.cpu_only or config.get("runtime", {}).get("device") == "cpu"
    
    # Extract sampling options
    sampling_config = config.get("sampling", {})
    sampling_options = {
        "max_cases": args.max_cases if args.max_cases is not None else sampling_config.get("max_cases"),
        "shuffle": args.shuffle or sampling_config.get("shuffle", False),
        "seed": args.seed if args.seed is not None else sampling_config.get("seed", 42),
        "risk_balanced": args.risk_balanced or sampling_config.get("risk_balanced", False),
        "genus_balanced": args.genus_balanced or sampling_config.get("genus_balanced", False),
        "include_dangerous_genera": args.include_dangerous_genera or sampling_config.get("include_dangerous_genera", False)
    }

    # Safety options
    safety_config = config.get("safety", {})
    debug_safety = args.debug_safety or safety_config.get("debug_safety", False)
    max_safety_debug_cases = args.max_safety_debug_cases or safety_config.get("max_safety_debug_cases", 10)
    mode = args.mode

    # Propagate model and runtime config settings to environment variables
    models_config = config.get("models", {})
    if models_config:
        for k, v in models_config.items():
            if v is not None:
                os.environ[k.upper()] = str(v)
    runtime_config = config.get("runtime", {})
    if runtime_config:
        if "cpu_only" in runtime_config:
            if runtime_config["cpu_only"]:
                cpu_only = True
        if "device" in runtime_config:
            dev_val = runtime_config["device"]
            os.environ["YOLOE_DEVICE"] = str(dev_val)
            os.environ["DINO_DEVICE"] = str(dev_val)
            os.environ["SIGLIP_DEVICE"] = str(dev_val)

    output_dir.mkdir(parents=True, exist_ok=True)
    poisonous_catalog = root_dir / "backend" / "app" / "data" / "poisonous_species.json"

    print("==================================================")
    print("      VISIONSETIL LARGE DATASET BENCHMARK         ")
    print("==================================================")
    print(f"  - Dataset Name: {dataset_name}")
    print(f"  - Dataset Root: {dataset_root}")
    print(f"  - Output Dir: {output_dir}")
    print(f"  - CPU Only: {cpu_only}")
    print(f"  - Execution Mode: {mode}")
    print(f"  - Sampling Config: {json.dumps(sampling_options, indent=2)}")
    print_memory_stats(clear_cache=True)

    # Validate dataset_root path exists
    root_path = Path(dataset_root)
    if not root_path.exists():
        # Fallback to local mock files for testing/development
        print(f"Warning: Dataset root {dataset_root} not found.")
        local_mock_root = root_dir / "kaggle_dataset_export"
        if local_mock_root.exists():
            print(f"  - Falling back to local mock folder: {local_mock_root}")
            dataset_root = str(local_mock_root)
            root_path = local_mock_root
        else:
            print(f"Error: Dataset directory {dataset_root} not found.", file=sys.stderr)
            sys.exit(1)

    # 2. Invoke converter (if mode is not fusion_eval_only)
    observations = []
    if mode in ("full_pipeline", "convert_only"):
        start_time = time.perf_counter()
        try:
            if dataset_name.lower() in ("fungiclef2025", "fungiclef"):
                observations = convert_fungiclef(dataset_root, converted_dataset_path, poisonous_catalog, sampling_options)
            elif dataset_name.lower() == "fungitastic":
                observations = convert_fungitastic(dataset_root, converted_dataset_path, poisonous_catalog, sampling_options)
            elif dataset_name.lower() == "df20":
                observations = convert_df20(dataset_root, converted_dataset_path, poisonous_catalog, sampling_options)
            else:
                # Fallback generic converter using FungiCLEF parser
                print(f"Warning: Unknown dataset name '{dataset_name}'. Using generic FungiCLEF converter as fallback.")
                observations = convert_fungiclef(dataset_root, converted_dataset_path, poisonous_catalog, sampling_options)
        except Exception as e:
            print(f"Error converting dataset: {e}", file=sys.stderr)
            sys.exit(1)

        if not observations:
            print("Error: Converted observations dataset is empty.", file=sys.stderr)
            sys.exit(1)

        # Calculate dataset stats and validate
        total_images_in_sample = sum(len(o.get("images", [])) for o in observations)
        if total_images_in_sample == 0:
            print("Error: Total Images in Benchmark is 0. No matching image files could be located in the dataset.", file=sys.stderr)
            sys.exit(1)

        # Validate that we have valid taxonomy labels to calculate accuracy
        has_valid_taxonomy = any(o.get("expected_taxon") and o.get("expected_taxon") != "unknown_fungus" for o in observations)
        if not has_valid_taxonomy:
            print("Error: No valid expected_taxon or expected_genus labels found in the dataset metadata to compute accuracy.", file=sys.stderr)
            sys.exit(1)

        unique_species = sorted(list(set(o.get("expected_taxon", "unknown_fungus") for o in observations)))
        unique_genera = sorted(list(set(o.get("expected_genus", "unknown") for o in observations)))

        if len(observations) > 1:
            if len(unique_species) <= 1:
                print(f"Error: Unique Species Covered is {len(unique_species)}, which is <= 1. Benchmark is invalid.", file=sys.stderr)
                sys.exit(1)
            if len(unique_genera) <= 1:
                print(f"Error: Unique Genera Covered is {len(unique_genera)}, which is <= 1. Benchmark is invalid.", file=sys.stderr)
                sys.exit(1)

        cases_with_taxon = sum(1 for o in observations if o.get("expected_taxon") and o.get("expected_taxon") != "unknown_fungus")
        cases_with_genus = sum(1 for o in observations if o.get("expected_genus") and o.get("expected_genus") != "unknown")
        half_cases = len(observations) / 2
        if cases_with_taxon < half_cases or cases_with_genus < half_cases:
            print(f"Error: Missing expected_taxon or expected_genus in the majority of cases. "
                  f"Taxon present: {cases_with_taxon}/{len(observations)}, Genus present: {cases_with_genus}/{len(observations)}", file=sys.stderr)
            sys.exit(1)

        # Reject sample submission usage
        for o in observations:
            src_dataset = str(o.get("source", {}).get("dataset", "")).lower()
            if "submission" in src_dataset or "sample" in src_dataset:
                print("Error: SAMPLE_SUBMISSION used as metadata principal. Ground truth is invalid.", file=sys.stderr)
                sys.exit(1)

        if mode == "convert_only":
            print(f"Conversion complete. Converted observations written to {converted_dataset_path}")
            sys.exit(0)

    elif mode == "siglip_embeddings_only":
        print("Extracting and caching embeddings to avoid runtime OOM/timeouts...")
        if not converted_dataset_path.exists():
            print(f"Error: Converted dataset path {converted_dataset_path} does not exist. Run in convert_only mode first.", file=sys.stderr)
            sys.exit(1)
        with open(converted_dataset_path, "r", encoding="utf-8") as f:
            observations = json.load(f)

        from app.ml.model_registry import build_model_registry
        registry = build_model_registry()

        image_paths = []
        for o in observations:
            image_paths.extend(o.get("images", []))
        image_paths = sorted(list(set(image_paths)))
        print(f"Embedding {len(image_paths)} unique images...")

        batch_size = runtime_config.get("batch_size", 4)
        for i in range(0, len(image_paths), batch_size):
            batch = image_paths[i:i+batch_size]
            try:
                registry.image_text_embedder.embed_images(batch)
                registry.visual_embedder.embed_images(batch)
                print(f"Progress: {i + len(batch)}/{len(image_paths)} images processed.")
            except Exception as e:
                print(f"Warning embedding batch {batch}: {e}")
        print("Embedding extraction complete.")
        sys.exit(0)

    elif mode == "fusion_eval_only":
        if not converted_dataset_path.exists():
            print(f"Error: Converted dataset path {converted_dataset_path} does not exist. Run in convert_only mode first.", file=sys.stderr)
            sys.exit(1)
        with open(converted_dataset_path, "r", encoding="utf-8") as f:
            observations = json.load(f)
        total_images_in_sample = sum(len(o.get("images", [])) for o in observations)
        unique_species = sorted(list(set(o.get("expected_taxon", "unknown_fungus") for o in observations)))
        unique_genera = sorted(list(set(o.get("expected_genus", "unknown") for o in observations)))

    danger_genera_found = [g for g in unique_genera if g.lower() in HIGH_RISK_GENERA]
    risk_breakdown = {"deadly": 0, "high_or_unknown": 0, "unknown": 0}
    for o in observations:
        rl = o.get("risk_level", "unknown")
        risk_breakdown[rl] = risk_breakdown.get(rl, 0) + 1

    # 3. Execute eval/scripts/run_eval.py
    report_json_path = output_dir / "real_report.json"
    report_md_path = output_dir / "real_report.md"
    
    eval_script_path = root_dir / "eval" / "scripts" / "run_eval.py"
    
    env = os.environ.copy()
    env["PYTHONPATH"] = str(root_dir) + os.pathsep + env.get("PYTHONPATH", "")
    if cpu_only:
        env["FORCE_CPU"] = "true"

    cmd = [
        sys.executable,
        str(eval_script_path),
        "--dataset", str(converted_dataset_path),
        "--output", str(report_json_path)
    ]
    if debug_safety:
        cmd.append("--debug-safety")
    if max_safety_debug_cases is not None:
        cmd.extend(["--max-safety-debug-cases", str(max_safety_debug_cases)])
    
    print(f"\nRunning evaluation pipeline: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    
    if res.returncode != 0:
        print("Error running run_eval.py pipeline:", file=sys.stderr)
        print(res.stderr, file=sys.stderr)
        sys.exit(res.returncode)

    print(res.stdout)

    # Copy files created in eval/reports to output_dir
    default_report_dir = root_dir / "eval" / "reports"
    files_to_move = [
        "confusion_species.csv",
        "confusion_genus.csv",
        "confusion_risk_level.csv",
        "failure_cases.json",
        "dangerous_failures.json",
        "overconfident_wrong_cases.json",
        "safety_debug_violations.json"
    ]
    for f_name in files_to_move:
        src = default_report_dir / f_name
        if src.exists():
            dest = output_dir / f_name
            try:
                if dest.exists():
                    dest.unlink()
                shutil.move(str(src), str(dest))
            except Exception as e:
                print(f"Warning moving {f_name} to output: {e}")

    # Copy md report
    src_md = default_report_dir / "report.md"
    if src_md.exists():
        try:
            shutil.move(str(src_md), str(report_md_path))
        except Exception as e:
            print(f"Warning moving report.md: {e}")

    # 4. Load report metrics
    evaluation_metrics = {}
    model_status_data = {}
    if report_json_path.exists():
        with open(report_json_path, "r", encoding="utf-8") as f:
            report_data = json.load(f)
        evaluation_metrics = report_data.get("metrics", {})
        model_status_data = report_data.get("model_status", {})

    # Validation: Explicitly fail if safety violations exist
    safety_policy_violations = evaluation_metrics.get("safety_policy_violations", 0)
    if safety_policy_violations > 0:
        print(f"Error: Safety Violations Count is {safety_policy_violations}, which is > 0. Benchmark failed.", file=sys.stderr)
        sys.exit(1)

    # Validation: Warn if all models are mock/fallback
    all_mock = all(not m_info.get("loaded", False) for m_info in model_status_data.values())
    if all_mock:
        print("\n==================================================")
        print("WARNING: Benchmark validates pipeline and safety only, not biological accuracy.")
        print("==================================================\n")
    else:
        # Warn if large dataset run (>= 1000 observations) has no real embedder models loaded
        has_real_embedder = False
        if model_status_data.get("visual_embedder", {}).get("loaded") or model_status_data.get("image_text_embedder", {}).get("loaded"):
            has_real_embedder = True
        if not has_real_embedder and len(observations) >= 1000:
            print("\nWARNING: Large dataset benchmark running with 1000+ cases but NO real embedder models loaded!", file=sys.stderr)

    elapsed_time = time.perf_counter() - start_time

    # 5. Generate large_dataset_summary.json
    summary_json = {
        "dataset_name": dataset_name,
        "dataset_root": dataset_root,
        "execution_time_seconds": round(elapsed_time, 2),
        "total_observations_processed": len(observations),
        "total_images_processed": total_images_in_sample,
        "skipped_observations": evaluation_metrics.get("skipped_cases", 0),
        "evaluated_observations": evaluation_metrics.get("evaluated_cases", 0),
        "unique_species_covered_count": len(unique_species),
        "unique_genera_covered_count": len(unique_genera),
        "dangerous_genera_included": danger_genera_found,
        "risk_levels_counts": risk_breakdown,
        "model_status": model_status_data,
        "metrics": evaluation_metrics
    }
    
    with open(output_dir / "large_dataset_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_json, f, indent=2, ensure_ascii=False)

    # 6. Generate large_dataset_summary.md
    summary_md = f"""# VisionSetil Large Public Dataset Benchmark Report

## Executive Summary
- **Dataset Evaluated:** `{dataset_name}`
- **Dataset Root Path:** `{dataset_root}`
- **Execution Time:** {elapsed_time:.2f} seconds
- **Production Readiness:** `{report_data.get("production_readiness", {}).get("status", "UNKNOWN")}`
- **Readiness Reason:** {report_data.get("production_readiness", {}).get("reason", "N/A")}

---

## Dataset Characteristics
- **Total Converted Observations:** {len(observations)}
- **Total Images in Benchmark:** {total_images_in_sample}
- **Unique Species Covered:** {len(unique_species)}
- **Unique Genera Covered:** {len(unique_genera)}
- **Dangerous Genera Included:** {', '.join(danger_genera_found) if danger_genera_found else 'None'}
- **Risk Level Breakdown:**
  * deadly: {risk_breakdown.get('deadly', 0)}
  * high_or_unknown: {risk_breakdown.get('high_or_unknown', 0)}
  * unknown: {risk_breakdown.get('unknown', 0)}

---

## Primary ML & Safety Metrics
| Metric | Value | Target |
| --- | --- | --- |
| **Species Top-1 Accuracy** | {evaluation_metrics.get('species_top1_accuracy', 0)*100:.2f}% | N/A |
| **Species Top-5 Accuracy** | {evaluation_metrics.get('species_top5_accuracy', 0)*100:.2f}% | N/A |
| **Genus Accuracy** | {evaluation_metrics.get('genus_accuracy', 0)*100:.2f}% | N/A |
| **False Safe Rate** | {evaluation_metrics.get('false_safe_rate', 0)*100:.2f}% | **Exactly 0.00%** |
| **Toxic Not Flagged Rate** | {evaluation_metrics.get('toxic_not_flagged_rate', 0)*100:.2f}% | **Exactly 0.00%** |
| **Overconfident Wrong Rate** | {evaluation_metrics.get('overconfident_wrong_rate', 0)*100:.2f}% | **< 5.0%** |
| **Safety Violations Count** | {evaluation_metrics.get('safety_policy_violations', 0)} | **Exactly 0** |

---

## Models Loaded Backend Status
"""
    for m_name, m_info in model_status_data.items():
        summary_md += f"- **{m_name}:** `{m_info.get('backend')}` (Loaded: {m_info.get('loaded')}, Device: {m_info.get('device')})\n"

    # Warning for mock stack
    all_mock = all(not m_info.get("loaded", False) for m_info in model_status_data.values())
    if all_mock:
        summary_md += "\n> [!WARNING]\n> If all models are mocks, this run validates pipeline behavior and safety logic, not biological identification accuracy.\n"

    with open(output_dir / "large_dataset_summary.md", "w", encoding="utf-8") as f:
        f.write(summary_md)

    # Save model status JSON
    with open(output_dir / "model_status.json", "w", encoding="utf-8") as f:
        json.dump(model_status_data, f, indent=2)

    print(f"\nLarge Dataset Benchmark Completed successfully.")
    print(f"  - Summary Markdown written to: {output_dir / 'large_dataset_summary.md'}")
    print(f"  - Summary JSON written to: {output_dir / 'large_dataset_summary.json'}")
    print_memory_stats(clear_cache=True)

if __name__ == "__main__":
    main()
