"""Pull the executed Kaggle notebook to read cell-level errors."""
import sys
import os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from kaggle import api

kernel = "alonsoalvira/visionsetil-mega-training"
out_dir = "kaggle/kernel_output"
os.makedirs(out_dir, exist_ok=True)

# Pull the notebook itself (which includes outputs after execution)
try:
    api.kernels_pull(kernel, path=out_dir, metadata=False)
    print("Pulled notebook successfully")
except Exception as e:
    print(f"Pull error: {e}")

# List all files
for f in os.listdir(out_dir):
    p = os.path.join(out_dir, f)
    print(f"  {f}: {os.path.getsize(p)} bytes")