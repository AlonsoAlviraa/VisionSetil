#!/usr/bin/env python3
"""Monitor v11 kernel status and push GPU version when ready.
Also handles the re-push with GPU enabled once the initial version processes."""
import os, json, subprocess, time, sys
from pathlib import Path

USERNAME = "alonsoalviraaaa"
os.environ["KAGGLE_USERNAME"] = USERNAME
os.environ["KAGGLE_KEY"] = "KGAT_47893c54215cc359ba93342189276b23"

# Check status of v11
print("=== Checking v11 status ===")
result = subprocess.run(
    ["kaggle", "kernels", "status", f"{USERNAME}/visionsetil-v11"],
    capture_output=True, text=True, timeout=30
)
print(f"  CLI status: {result.stdout.strip()}")
if result.stderr:
    print(f"  CLI stderr: {result.stderr.strip()}")

# Try REST API for status
import requests
HEADERS = {"Authorization": "Bearer KGAT_47893c54215cc359ba93342189276b23"}
r = requests.get(
    "https://www.kaggle.com/api/v1/kernels/status",
    params={"userName": USERNAME, "kernelSlug": "visionsetil-v11"},
    headers=HEADERS, timeout=30
)
print(f"  REST status: {r.status_code} {r.text[:300]}")

# If kernel is complete or error, try to push GPU version
if r.status_code == 200:
    data = r.json()
    status = data.get("status", "")
    print(f"  Status: {status}")
    
    if status in ["complete", "error", "cancelled"]:
        print("\n=== Pushing GPU version (v2) ===")
        push_dir = Path("tmp/push_v11")
        meta = json.loads((push_dir / "kernel-metadata.json").read_text())
        meta["enable_gpu"] = True
        (push_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))
        
        result = subprocess.run(
            ["kaggle", "kernels", "push", "-p", str(push_dir)],
            capture_output=True, text=True, timeout=60
        )
        print(f"  stdout: {result.stdout}")
        print(f"  stderr: {result.stderr}")
        print(f"  rc: {result.returncode}")
        
        if result.returncode == 0:
            print("\n✅ GPU version pushed! Kernel will start training.")
        elif "Maximum batch GPU session count" in result.stdout:
            print("\n⚠️ GPU sessions full! You need to cancel other running GPU kernels.")
            print("   Check: https://www.kaggle.com/code?contentName=visionsetil-v11")
            print("   Or cancel from Kaggle UI: Your Account > Your Work > Running")
    elif status == "running":
        print("\n⏳ Kernel still running (no-GPU version). It will likely fail without GPU.")
        print("   Wait for it to finish, then re-run this script.")