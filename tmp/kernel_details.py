"""Get detailed kernel info via Kaggle API."""
import sys
import os
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from kaggle import KaggleApi

api = KaggleApi()
api.authenticate()

kernel = "alonsoalvira/visionsetil-mega-training"
owner, slug = kernel.split("/")

# Try to get kernel details via the raw API
try:
    # Use the internal API client
    response = api.process_response(
        api.kernels_get_api_client().kernels_view(
            user_name=owner, kernel_slug=slug
        )
    )
    print("=== Kernel Details ===")
    for key in ['status', 'failureMessage', 'lastRunTime', 'totalVotes', 
                 'category', 'language', 'kernelType', 'isGpuEnabled',
                 'datasetSources', 'totalViews', 'author']:
        val = response.get(key, "N/A") if isinstance(response, dict) else getattr(response, key, "N/A")
        print(f"  {key}: {val}")
except Exception as e:
    print(f"Details error: {type(e).__name__}: {e}")

# Also check if there's output via the output endpoint
try:
    print("\n=== Trying output list ===")
    # Force download with different approach
    import subprocess
    result = subprocess.run(
        ["kaggle", "kernels", "output", kernel, "-p", "kaggle/kernel_output2"],
        capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    print(f"stdout: {result.stdout[:2000]}")
    print(f"stderr: {result.stderr[:2000]}")
    print(f"returncode: {result.returncode}")
except Exception as e:
    print(f"Output error: {e}")