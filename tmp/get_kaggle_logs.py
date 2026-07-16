"""Download Kaggle kernel output with proper UTF-8 encoding."""
import sys
import os

# Force UTF-8 on all streams before any output
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from kaggle import api

kernel = "alonsoalvira/visionsetil-mega-training"
out_dir = "kaggle/kernel_output"
os.makedirs(out_dir, exist_ok=True)

try:
    api.kernels_output(kernel, path=out_dir, force=True, quiet=False)
    print(f"\n✅ Downloaded output to {out_dir}")
except Exception as e:
    print(f"\n❌ Error: {e}", file=sys.stderr)
    # Try listing what we got
    files = os.listdir(out_dir) if os.path.exists(out_dir) else []
    print(f"Files in {out_dir}: {files}")