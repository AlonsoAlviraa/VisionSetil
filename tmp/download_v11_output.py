#!/usr/bin/env python3
"""Download v11 kernel output once training completes.
Run this after the GPU version finishes training.

Usage:
    python tmp/download_v11_output.py
    
This will download all output files to kaggle/kernel_output_v11/
"""
import os, sys, subprocess, json
from pathlib import Path

USERNAME = "alonsoalviraaaa"
KERNEL_SLUG = "visionsetil-v11"
os.environ["KAGGLE_USERNAME"] = USERNAME
os.environ["KAGGLE_KEY"] = "KGAT_47893c54215cc359ba93342189276b23"

out_dir = Path("kaggle/kernel_output_v11")
out_dir.mkdir(parents=True, exist_ok=True)

print(f"Downloading output from {USERNAME}/{KERNEL_SLUG} to {out_dir}...")
result = subprocess.run(
    ["kaggle", "kernels", "output", f"{USERNAME}/{KERNEL_SLUG}", "-p", str(out_dir)],
    capture_output=True, text=True, timeout=300
)
print(f"Return code: {result.returncode}")
if result.stdout:
    print(f"stdout: {result.stdout[:500]}")
if result.stderr:
    print(f"stderr: {result.stderr[:500]}")

# List downloaded files
if out_dir.exists():
    print("\n=== Downloaded files ===")
    for f in sorted(out_dir.rglob("*")):
        if f.is_file():
            print(f"  {f.relative_to(out_dir)} ({f.stat().st_size:,} bytes)")

# If metrics.json exists, show results
metrics_path = out_dir / "models" / "metrics.json"
if metrics_path.exists():
    print("\n=== RESULTS ===")
    metrics = json.loads(metrics_path.read_text())
    print(json.dumps(metrics, indent=2))
    
    map3 = metrics.get("test_map_at_3", 0)
    safety = metrics.get("safety_recall_deadly", 0)
    ece = metrics.get("test_ece", 1)
    
    print(f"\n=== DoD CHECK ===")
    print(f"  MAP@3 >= 0.45:    {'PASS' if map3 >= 0.45 else 'FAIL'} ({map3:.4f})")
    print(f"  Safety Recall = 1.0: {'PASS' if safety >= 1.0 else 'FAIL'} ({safety:.4f})")
    print(f"  ECE <= 0.15:      {'PASS' if ece <= 0.15 else 'FAIL'} ({ece:.4f})")
else:
    print("\nNo metrics.json found. Kernel may still be running or failed.")
    print(f"Check: https://www.kaggle.com/code/alonsoalvira/{KERNEL_SLUG}")