import sys
import os
import builtins
from pathlib import Path

# 1. Unshadow kaggle package by removing local kaggle folder from sys.path
sys.path = [p for p in sys.path if p != "" and p != "." and Path(p).resolve() != Path(__file__).resolve().parents[2]]

# 2. Patch builtins.open to force UTF-8 encoding on text files (avoids CP1252 crash on Windows logs)
original_open = builtins.open

def patched_open(*args, **kwargs):
    # Check mode
    mode = args[1] if len(args) > 1 else kwargs.get("mode", "r")
    if "b" not in mode and "encoding" not in kwargs:
        kwargs["encoding"] = "utf-8"
    return original_open(*args, **kwargs)

builtins.open = patched_open

# 3. Import and authenticate Kaggle API
from kaggle.api.kaggle_api_extended import KaggleApi
api = KaggleApi()
api.authenticate()

# 4. Target files list
report_files = [
    "real_report.json",
    "real_report.md",
    "large_dataset_summary.json",
    "large_dataset_summary.md",
    "model_status.json",
    "converted_fungiclef2025_observations.json",
    "safety_debug_violations.json",
    "confusion_species.csv",
    "confusion_genus.csv",
    "confusion_risk_level.csv",
    "failure_cases.json",
    "dangerous_failures.json",
    "overconfident_wrong_cases.json"
]

dest_dir = Path(__file__).resolve().parents[2] / "kaggle_cloud_outputs" / "starter_outputs" / "visionsetil_outputs"
dest_dir.mkdir(parents=True, exist_ok=True)

print(f"Downloading reports to {dest_dir}...")

for filename in report_files:
    # Build regex pattern for specific file
    pattern = f".*{filename}$"
    print(f"Downloading {filename}...")
    try:
        api.kernels_output(
            kernel="alonsoalvira/fungiclef25-starter-notebook/5",
            path=str(dest_dir),
            file_pattern=pattern,
            force=True,
            quiet=True
        )
    except Exception as e:
        print(f"Error downloading {filename}: {e}")

print("All downloads completed!")
