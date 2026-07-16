"""Download v7 kernel output and extract all results for audit."""
import requests
import json
import os
import zipfile
import io
from pathlib import Path

USERNAME = "alonsoalviraaaa"
TOKEN = os.environ.get("KAGGLE_KEY", "")
SLUG = "visionsetil-mega-training-v7"
OUT_DIR = Path(r"C:\AlonsoAlviraa\VisionSetil\kaggle\kernel_output_v7")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Try CLI first
print("=" * 60)
print(f"Downloading kernel output: {USERNAME}/{SLUG}")
print("=" * 60)

# Method 1: CLI
import subprocess, sys
try:
    result = subprocess.run(
        ["kaggle", "kernels", "output", f"{USERNAME}/{SLUG}", "-p", str(OUT_DIR), "--force"],
        capture_output=True, text=True, timeout=300
    )
    print(f"CLI stdout: {result.stdout[:500]}")
    print(f"CLI stderr: {result.stderr[:500]}")
except Exception as e:
    print(f"CLI error: {e}")

# List downloaded files
print(f"\nFiles in {OUT_DIR}:")
for f in sorted(OUT_DIR.iterdir()):
    print(f"  {f.name}: {f.stat().st_size:,} bytes")