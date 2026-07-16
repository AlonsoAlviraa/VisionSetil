#!/usr/bin/env python3
"""Comprehensive kernel management: check sessions, cancel if needed, download output."""
import requests, json, os, subprocess, sys
from pathlib import Path

TOKEN = "KGAT_47893c54215cc359ba93342189276b23"
USERNAME = "alonsoalviraaaa"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
os.environ["KAGGLE_USERNAME"] = USERNAME
os.environ["KAGGLE_KEY"] = TOKEN

def api_get(endpoint, params=None):
    r = requests.get(f"https://www.kaggle.com/api/v1/{endpoint}",
                     params=params, headers=HEADERS, timeout=30)
    return r

# 1. List ALL kernels with details
print("=== ALL kernels (checking for running ones) ===")
r = api_get("kernels/list", {"user": USERNAME, "page_size": 50})
kernels = r.json() if r.status_code == 200 else []
print(f"Total: {len(kernels)}")

for k in kernels:
    ref = k.get("ref", "")
    title = k.get("title", "")
    last_run = k.get("lastRunTime", "")
    is_private = k.get("isPrivate", False)
    gpu = k.get("enableGpu", False)
    ver = k.get("currentVersionNumber", 0)
    print(f"  {ref:55s} GPU={gpu!s:5s} v={ver} last={last_run}")

# 2. Try to get status of visionsetil kernel
print("\n=== VisionSetil kernel status ===")
for slug in ["visionsetil-mega-training", "visionsetil-mega-training-v11", "visionsetil-v12"]:
    r = api_get("kernels/status", {"userName": USERNAME, "kernelSlug": slug})
    print(f"  {slug}: {r.status_code} {r.text[:200]}")

# 3. Try downloading output from existing kernel
print("\n=== Downloading existing kernel output ===")
for slug in ["visionsetil-mega-training"]:
    out_dir = Path(f"kaggle/kernel_output_latest")
    out_dir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["kaggle", "kernels", "output", f"{USERNAME}/{slug}", "-p", str(out_dir)],
        capture_output=True, text=True, timeout=120
    )
    print(f"  {slug}: rc={result.returncode}")
    if result.stdout: print(f"    stdout: {result.stdout[:300]}")
    if result.stderr: print(f"    stderr: {result.stderr[:300]}")
    # List downloaded files
    if out_dir.exists():
        files = list(out_dir.rglob("*"))
        print(f"    Files downloaded: {len(files)}")
        for f in files[:10]:
            if f.is_file():
                print(f"      {f.relative_to(out_dir)} ({f.stat().st_size} bytes)")

# 4. Check what kernels have GPU enabled
print("\n=== GPU kernels ===")
gpu_kernels = [k for k in kernels if k.get("enableGpu")]
print(f"GPU kernels: {len(gpu_kernels)}")
for k in gpu_kernels:
    print(f"  {k.get('ref','')} last={k.get('lastRunTime','')}")