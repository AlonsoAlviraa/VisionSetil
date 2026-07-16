import builtins
import os
import sys
from pathlib import Path

import requests

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
from kagglesdk.kernels.types.kernels_api_service import ApiListKernelSessionOutputRequest

api = KaggleApi()
api.authenticate()

# 4. Target files list
target_names = {
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
    "overconfident_wrong_cases.json",
    "ablation_report.json",
    "ablation_report.md",
    "open_set_thresholds.json",
    "open_set_thresholds.md",
    "real_species_catalog.json",
    "species_index",
    "species_visual_prototypes.json",
    "genus_prototypes.json",
    "family_prototypes.json",
    "index_metadata.json",
    "catalog_diagnostics.json",
    "catalog_diagnostics.md",
    "phase6_split_manifest.json",
    "phase6_index_excluded_ids.json",
}

dest_dir = Path(__file__).resolve().parents[2] / "kaggle_cloud_outputs" / "starter_outputs" / "visionsetil_outputs"
dest_dir.mkdir(parents=True, exist_ok=True)

kernel = os.getenv("KAGGLE_KERNEL", "alonsoalvira/fungiclef25-starter-notebook")
owner_slug, kernel_slug, _version = api.parse_kernel_string(kernel)
print(f"Downloading latest reports from {kernel} to {dest_dir}...")

downloaded = []
page_token = None
with api.build_kaggle_client() as kaggle:
    while True:
        request = ApiListKernelSessionOutputRequest()
        request.user_name = owner_slug
        request.kernel_slug = kernel_slug
        if page_token:
            request.page_token = page_token
        response = kaggle.kernels.kernels_api_client.list_kernel_session_output(request)

        for item in response.files or []:
            file_name = item.file_name.replace("\\", "/")
            base_name = Path(file_name).name
            is_target = base_name in target_names or "/species_index/" in file_name
            if not is_target:
                continue

            relative_name = file_name
            marker = "visionsetil_outputs/"
            if marker in relative_name:
                relative_name = relative_name.split(marker, 1)[1]
            outfile = dest_dir / relative_name
            outfile.parent.mkdir(parents=True, exist_ok=True)

            data = requests.get(item.url, timeout=120)
            data.raise_for_status()
            outfile.write_bytes(data.content)
            downloaded.append(str(outfile))
            print(f"Downloaded {file_name} -> {outfile}")

        page_token = response.next_page_token
        if not page_token:
            break

if response.log:
    log_path = dest_dir / f"{kernel_slug}.log"
    log_path.write_text(response.log, encoding="utf-8")
    downloaded.append(str(log_path))

print(f"All downloads completed. Files downloaded: {len(downloaded)}")
