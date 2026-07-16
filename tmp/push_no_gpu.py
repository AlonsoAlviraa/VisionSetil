#!/usr/bin/env python3
"""Push v11 kernel without GPU (to save code), since GPU sessions are full.
The user can then run it from the Kaggle UI once GPU slots free up."""
import json, os, subprocess, sys
from pathlib import Path

os.environ["KAGGLE_USERNAME"] = "alonsoalviraaaa"
os.environ["KAGGLE_KEY"] = "KGAT_47893c54215cc359ba93342189276b23"

# Read and modify metadata to disable GPU (just for initial save)
push_dir = Path("tmp/push_v11")
meta = json.loads((push_dir / "kernel-metadata.json").read_text())

# Try pushing with GPU disabled first
print("=== Attempt 1: Push without GPU (save code only) ===")
meta["enable_gpu"] = False
meta["id"] = "alonsoalviraaaa/visionsetil-v11"
meta["title"] = "visionsetil-v11"
(push_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))

result = subprocess.run(
    ["kaggle", "kernels", "push", "-p", str(push_dir)],
    capture_output=True, text=True, timeout=60
)
print(f"  stdout: {result.stdout}")
print(f"  stderr: {result.stderr}")
print(f"  rc: {result.returncode}")

# If that worked, try re-pushing with GPU enabled
if result.returncode == 0 and "error" not in result.stdout.lower():
    print("\n=== Attempt 2: Re-push with GPU enabled ===")
    meta["enable_gpu"] = True
    (push_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))
    result2 = subprocess.run(
        ["kaggle", "kernels", "push", "-p", str(push_dir)],
        capture_output=True, text=True, timeout=60
    )
    print(f"  stdout: {result2.stdout}")
    print(f"  stderr: {result2.stderr}")
    print(f"  rc: {result2.returncode}")
else:
    print("\n=== Trying original slug without GPU ===")
    meta["enable_gpu"] = False
    meta["id"] = "alonsoalviraaaa/visionsetil-mega-training"
    meta["title"] = "visionsetil-mega-training"
    (push_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))
    result3 = subprocess.run(
        ["kaggle", "kernels", "push", "-p", str(push_dir)],
        capture_output=True, text=True, timeout=60
    )
    print(f"  stdout: {result3.stdout}")
    print(f"  stderr: {result3.stderr}")
    print(f"  rc: {result3.returncode}")