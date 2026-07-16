"""Read the tail of the Kaggle kernel log with proper UTF-8."""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = "kaggle/kernel_output/visionsetil-mega-training.log"
size = os.path.getsize(p)
print(f"File size: {size} bytes\n")

with open(p, "r", encoding="utf-8", errors="replace") as f:
    text = f.read()

# Print last 6000 chars to see the error
print(text[-6000:])