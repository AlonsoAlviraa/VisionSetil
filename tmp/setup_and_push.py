#!/usr/bin/env python3
"""Set up Kaggle credentials and push v11 kernel."""
import os, json, sys, subprocess
from pathlib import Path

# Set up kaggle.json
USERNAME = "alonsoalviraaaa"
TOKEN = "KGAT_47893c54215cc359ba93342189276b23"

kaggle_dir = Path.home() / ".kaggle"
kaggle_dir.mkdir(exist_ok=True)
kaggle_json = kaggle_dir / "kaggle.json"
kaggle_json.write_text(json.dumps({"username": USERNAME, "key": TOKEN}))
kaggle_json.chmod(0o600)
print(f"Wrote {kaggle_json}")

# Also set env vars for this process
os.environ["KAGGLE_USERNAME"] = USERNAME
os.environ["KAGGLE_KEY"] = TOKEN

# Step 1: Generate the v11 notebook
print("\n=== Generating v11 notebook ===")
result = subprocess.run(
    [sys.executable, "kaggle/gen_notebook_v11.py"],
    capture_output=True, text=True, timeout=30
)
print("STDOUT:", result.stdout)
if result.stderr:
    print("STDERR:", result.stderr[-500:])

# Verify notebook was generated
nb_path = Path("kaggle/visionsetil_mega_training.ipynb")
print(f"\nNotebook exists: {nb_path.exists()}, size: {nb_path.stat().st_size if nb_path.exists() else 0}")

# Step 2: Try pushing using kaggle CLI
print("\n=== Pushing v11 kernel via CLI ===")
result = subprocess.run(
    ["kaggle", "kernels", "push", "-p", "kaggle"],
    capture_output=True, text=True, timeout=60
)
print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)
print("Return code:", result.returncode)