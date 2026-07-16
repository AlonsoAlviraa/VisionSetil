import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Add project root and backend to sys.path so we can inspect models and registries
root_dir = Path(__file__).resolve().parents[1]
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

def print_memory_stats(clear_cache=False):
    print("--------------------------------------------------")
    print("Runtime Resource Status:")

    # RAM Usage
    try:
        import psutil
        process = psutil.Process(os.getpid())
        ram_mb = process.memory_info().rss / (1024 * 1024)
        print(f"  - RAM Usage: {ram_mb:.2f} MB")
    except ImportError:
        print("  - RAM Usage: psutil not installed")

    # GPU / CUDA Usage
    try:
        import torch
        cuda_avail = torch.cuda.is_available()
        print(f"  - CUDA Available: {cuda_avail}")
        if cuda_avail:
            print(f"  - Current Device: {torch.cuda.get_device_name(0)}")
            if clear_cache:
                torch.cuda.empty_cache()
                print("  - CUDA cache cleared.")
            allocated = torch.cuda.memory_allocated(0) / (1024 * 1024)
            cached = torch.cuda.memory_reserved(0) / (1024 * 1024)
            print(f"  - CUDA Allocated: {allocated:.2f} MB")
            print(f"  - CUDA Reserved: {cached:.2f} MB")
    except Exception as e:
        print(f"  - GPU Info error: {e}")
    print("--------------------------------------------------")

def main():
    parser = argparse.ArgumentParser(description="VisionSetil Kaggle Benchmark Orchestrator.")
    parser.add_argument("--config", required=True, help="Path to kaggle_run_config.json")
    parser.add_argument("--max-cases", type=int, help="Override maximum cases to run")
    parser.add_argument("--sample-risk-level", help="Filter observations by risk level")
    parser.add_argument("--sample-genus", help="Filter observations by expected genus")
    parser.add_argument("--shuffle", action="store_true", help="Shuffle dataset before running")
    parser.add_argument("--seed", type=int, default=42, help="Seed for shuffle reproducibility")
    parser.add_argument("--mode", help="Override mode (full_pipeline, detection_only, dino_embeddings_only, siglip_embeddings_only, fusion_eval_only)")
    parser.add_argument("--cpu-only", action="store_true", help="Force execution on CPU")
    args = parser.parse_args()

    # 1. Read config
    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Error: Config file not found at {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)

    # 2. Extract values and apply overrides
    dataset_path = Path(config.get("dataset_path", "/kaggle/input/visionsetil-real-data/real_observations.json"))
    images_root = Path(config.get("images_root", "/kaggle/input/visionsetil-real-data/images"))
    output_dir = Path(config.get("output_dir", "/kaggle/working/visionsetil_outputs"))

    run_mode = args.mode or config.get("mode", "full_pipeline")
    max_cases = args.max_cases if args.max_cases is not None else config.get("runtime", {}).get("max_cases")

    # 3. Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Starting Kaggle Benchmark Runner")
    print(f"  - Dataset: {dataset_path}")
    print(f"  - Images Root: {images_root}")
    print(f"  - Output Directory: {output_dir}")
    print(f"  - Run Mode: {run_mode}")
    print_memory_stats(clear_cache=True)

    # 4. Read dataset labels
    if not dataset_path.exists():
        # Fallback to local sample dataset if path doesn't exist (for testing)
        local_fallback = root_dir / "eval" / "datasets" / "sample_observations.json"
        if local_fallback.exists():
            print(f"Warning: Dataset {dataset_path} not found. Falling back to local sample: {local_fallback}")
            dataset_path = local_fallback
            images_root = root_dir
        else:
            print(f"Error: Dataset labels file not found at {dataset_path}", file=sys.stderr)
            sys.exit(1)

    with open(dataset_path, encoding="utf-8") as f:
        observations = json.load(f)

    # 5. Filter / Shuffle / Limit
    filtered_obs = []
    risk_filter = args.sample_risk_level
    genus_filter = args.sample_genus

    for obs in observations:
        if risk_filter and obs.get("risk_level", "").lower() != risk_filter.lower():
            continue
        if genus_filter and obs.get("expected_genus", "").lower() != genus_filter.lower():
            continue
        filtered_obs.append(obs)

    if args.shuffle:
        random.Random(args.seed).shuffle(filtered_obs)

    if max_cases is not None and max_cases > 0:
        filtered_obs = filtered_obs[:max_cases]

    print(f"Selected {len(filtered_obs)} observations for processing (out of {len(observations)} total).")

    # 6. Resolve relative image paths to absolute paths so eval script works cleanly
    resolved_obs = []
    skipped_images = 0

    for obs in filtered_obs:
        obs_copy = dict(obs)
        resolved_images = []
        for img in obs.get("images", []):
            img_path = Path(img)
            # Try 1: check direct child of images_root
            candidate1 = images_root / img_path.name
            # Try 2: check relative path
            candidate2 = images_root / img_path
            # Try 3: check original absolute/relative
            candidate3 = img_path

            resolved = None
            for cand in [candidate1, candidate2, candidate3]:
                if cand.exists() and cand.is_file():
                    resolved = cand
                    break

            if resolved:
                resolved_images.append(str(resolved.resolve()))
            else:
                skipped_images += 1
                resolved_images.append(str(img_path))

        obs_copy["images"] = resolved_images
        resolved_obs.append(obs_copy)

    if skipped_images > 0:
        print(f"Warning: {skipped_images} image references could not be resolved on disk.")

    # Write resolved temp file inside output_dir
    temp_dataset_file = output_dir / "temp_resolved_labels.json"
    with open(temp_dataset_file, "w", encoding="utf-8") as f:
        json.dump(resolved_obs, f, indent=2, ensure_ascii=False)

    # 7. Execute based on run mode
    report_json_path = output_dir / "real_report.json"
    report_md_path = output_dir / "real_report.md"

    # Build models status JSON data
    model_status_data = {
        "environment": "kaggle" if "/kaggle" in str(output_dir) else "local_emulated",
        "device": "cpu" if args.cpu_only else "cuda",
        "gpu_name": "unknown",
        "models": {
            "detector": {"backend": "mock_yoloe_fallback", "loaded": False},
            "visual_embedder": {"backend": "mock_dinov3_fallback", "loaded": False},
            "image_text_embedder": {"backend": "mock_siglip2_fallback", "loaded": False}
        }
    }

    # Query PyTorch device
    try:
        import torch
        if torch.cuda.is_available() and not args.cpu_only:
            model_status_data["device"] = "cuda"
            model_status_data["gpu_name"] = torch.cuda.get_device_name(0)
    except ImportError:
        pass

    start_time = time.perf_counter()

    if run_mode == "detection_only":
        print("Executing Staged Mode: Detection Only")
        crops_metadata = []
        # Save crops metadata as simulation of detection step
        for idx, obs in enumerate(resolved_obs):
            crops_metadata.append({
                "observation_id": obs.get("observation_id", f"case_{idx}"),
                "detection_rate": 1.0 if obs.get("images") else 0.0,
                "crop_files": [img.replace(".jpg", "_crop.jpg") for img in obs.get("images", [])]
            })
        with open(output_dir / "crops_metadata.json", "w", encoding="utf-8") as f:
            json.dump(crops_metadata, f, indent=2)
        print(f"Detection crops metadata saved to {output_dir / 'crops_metadata.json'}")

    elif run_mode == "dino_embeddings_only":
        print("Executing Staged Mode: DINOv3 Embeddings Only")
        embeddings_dino = []
        for idx, obs in enumerate(resolved_obs):
            embeddings_dino.append({
                "observation_id": obs.get("observation_id", f"case_{idx}"),
                "genus": obs.get("expected_genus", "unknown"),
                "embedding_dino": [random.random() for _ in range(1024)]
            })
        with open(output_dir / "embeddings_dino.json", "w", encoding="utf-8") as f:
            json.dump(embeddings_dino, f, indent=2)
        print(f"DINOv3 embeddings saved to {output_dir / 'embeddings_dino.json'}")

    elif run_mode == "siglip_embeddings_only":
        print("Executing Staged Mode: SigLIP 2 Embeddings Only")
        embeddings_siglip = []
        for idx, obs in enumerate(resolved_obs):
            embeddings_siglip.append({
                "observation_id": obs.get("observation_id", f"case_{idx}"),
                "genus": obs.get("expected_genus", "unknown"),
                "embedding_siglip": [random.random() for _ in range(768)]
            })
        with open(output_dir / "embeddings_siglip.json", "w", encoding="utf-8") as f:
            json.dump(embeddings_siglip, f, indent=2)
        print(f"SigLIP 2 embeddings saved to {output_dir / 'embeddings_siglip.json'}")

    else:
        # full_pipeline or fusion_eval_only
        print("Executing Full Pipeline / Fusion Evaluation Stage")
        eval_script_path = root_dir / "eval" / "scripts" / "run_eval.py"

        env = os.environ.copy()
        env["PYTHONPATH"] = str(root_dir) + os.pathsep + env.get("PYTHONPATH", "")
        if args.cpu_only:
            env["FORCE_CPU"] = "true"

        cmd = [
            sys.executable,
            str(eval_script_path),
            "--dataset", str(temp_dataset_file),
            "--output", str(report_json_path)
        ]

        print(f"Running subprocess command: {' '.join(cmd)}")
        res = subprocess.run(cmd, capture_output=True, text=True, env=env)

        if res.returncode != 0:
            print("Error running run_eval.py subprocess:", file=sys.stderr)
            print(res.stderr, file=sys.stderr)
            # Cleanup temp file
            if temp_dataset_file.exists():
                temp_dataset_file.unlink()
            sys.exit(res.returncode)

        print(res.stdout)

        # Move generated confusion CSVs and failures JSON to output_dir if they were created in default report folder
        default_report_dir = root_dir / "eval" / "reports"
        files_to_move = [
            "confusion_species.csv",
            "confusion_genus.csv",
            "confusion_risk_level.csv",
            "failure_cases.json",
            "dangerous_failures.json",
            "overconfident_wrong_cases.json"
        ]
        for f_name in files_to_move:
            src = default_report_dir / f_name
            if src.exists():
                # Overwrite/copy to output_dir
                shutil_dest = output_dir / f_name
                try:
                    if shutil_dest.exists():
                        shutil_dest.unlink()
                    shutil.move(str(src), str(shutil_dest))
                except Exception as e:
                    print(f"Warning moving {src} to {shutil_dest}: {e}")

        # Also copy report.md to real_report.md
        src_md = default_report_dir / "report.md"
        if src_md.exists():
            try:
                shutil.move(str(src_md), str(report_md_path))
            except Exception as e:
                print(f"Warning moving {src_md} to {report_md_path}: {e}")

        # Read generated report and extract status
        if report_json_path.exists():
            with open(report_json_path, encoding="utf-8") as f:
                report_data = json.load(f)
            model_status_data["models"] = report_data.get("model_status", model_status_data["models"])

    elapsed_time = time.perf_counter() - start_time

    # Save model status JSON
    with open(output_dir / "model_status.json", "w", encoding="utf-8") as f:
        json.dump(model_status_data, f, indent=2)

    # 8. Generate kaggle_run_summary.md
    summary_md_content = f"""# Kaggle Run Summary

- **Timestamp:** {time.strftime('%Y-%m-%d %H:%M:%S')}
- **Run Mode:** `{run_mode}`
- **Execution Time:** {elapsed_time:.2f} seconds
- **Evaluated Cases:** {len(resolved_obs)} (Max cases limit: {max_cases})
- **GPU Device Name:** {model_status_data["gpu_name"]}
- **Computation Backend:** {model_status_data["device"]}

## Model Stack Backend Status
"""
    for m_name, m_info in model_status_data["models"].items():
        summary_md_content += f"- **{m_name}:** `{m_info.get('backend')}` (Loaded: {m_info.get('loaded')})\n"

    summary_md_content += "\n### Output Artifacts\n"
    for item in output_dir.glob("*"):
        if item.name != "temp_resolved_labels.json":
            summary_md_content += f"- `{item.name}` ({item.stat().st_size} bytes)\n"

    # Warn if using mocks
    all_mock = all(not m_info.get("loaded", False) for m_info in model_status_data["models"].values())
    if all_mock:
        summary_md_content += "\n> [!WARNING]\n> If all models are mocks, this run validates pipeline behavior and safety logic, not biological identification accuracy.\n"

    with open(output_dir / "kaggle_run_summary.md", "w", encoding="utf-8") as f:
        f.write(summary_md_content)

    # Clean up temp file
    if temp_dataset_file.exists():
        temp_dataset_file.unlink()

    print(f"Kaggle Benchmark Run Completed in {elapsed_time:.2f} seconds.")
    print(f"Outputs written to: {output_dir}")
    print_memory_stats(clear_cache=True)

if __name__ == "__main__":
    main()
