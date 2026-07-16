"""Check Kaggle kernel status."""
import sys
import os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from kaggle import api

kernel = "alonsoalvira/visionsetil-mega-training"

# Get kernel status
try:
    status = api.kernels_status(kernel)
    print(f"Kernel status: {status}")
except Exception as e:
    print(f"Status error: {e}")

# Also try to list kernels to see more info
try:
    # The kernels_list doesn't give much, but let's try
    print("\nChecking via API...")
except Exception as e:
    print(f"List error: {e}")