#!/usr/bin/env python3
"""Try pushing with verbose CLI and also try a new kernel slug."""
import subprocess, sys, json, os
from pathlib import Path

os.environ["KAGGLE_USERNAME"] = "alonsoalviraaaa"
os.environ["KAGGLE_KEY"] = "KGAT_47893c54215cc359ba93342189276b23"

# First check if the kernel is currently running
print("=== Checking kernel status ===")
r = subprocess.run(
    ["kaggle", "kernels", "status", "alonsoalviraaaa/visionsetil-mega-training"],
    capture_output=True, text=True, timeout=30
)
print(f"Status: {r.stdout}")
print(f"Stderr: {r.stderr}")

# Try push with verbose
print("\n=== Push attempt 1: existing slug (verbose) ===")
r = subprocess.run(
    ["kaggle", "kernels", "push", "-p", "tmp/push_v11", "--force"],
    capture_output=True, text=True, timeout=60
)
print(f"stdout: {r.stdout}")
print(f"stderr: {r.stderr}")

# Try with a completely new title to create a new kernel
print("\n=== Push attempt 2: new slug 'visionsetil-v12' ===")
meta = json.loads(Path("tmp/push_v11/kernel-metadata.json").read_text())
meta["id"] = "alonsoalviraaaa/visionsetil-v12"
meta["title"] = "visionsetil-v12"
Path("tmp/push_v11/kernel-metadata.json").write_text(json.dumps(meta, indent=2))

r = subprocess.run(
    ["kaggle", "kernels", "push", "-p", "tmp/push_v11"],
    capture_output=True, text=True, timeout=60
)
print(f"stdout: {r.stdout}")
print(f"stderr: {r.stderr}")
print(f"return code: {r.returncode}")