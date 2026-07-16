"""Check kernel status and cancel if running, then push v7."""
from kaggle.api.kaggle_api_extended_api import KaggleApi
import time

api = KaggleApi()
api.authenticate()

KERNEL_SLUG = "visionsetil-mega-training"
OWNER = "alonsoalviraaaa"

# Check status
print("Checking kernel status...")
try:
    status = api.kernel_status(OWNER, KERNEL_SLUG)
    print(f"Status: {status}")
except Exception as e:
    print(f"Status check error: {e}")

# Try to pull current kernel output to see if it's still running
print("\nTrying to get kernel pull (metadata)...")
try:
    api.kernel_output(OWNER, KERNEL_SLUG, path="/tmp/kaggle_out_v7", force=True)
    print("Output downloaded")
except Exception as e:
    print(f"Output error: {e}")

# The 409 means a version is running. Let's wait and retry.
print("\nWaiting 60s then retrying push...")
time.sleep(60)

# Try push
print("Pushing v7...")
try:
    api.kernels_push("/AlonsoAlviraa/VisionSetil/kaggle")
    print("Push SUCCESS!")
except Exception as e:
    print(f"Push error: {e}")
    print("\nThe previous kernel is still running.")
    print("Options:")
    print("1. Wait for it to finish (check kaggle.com)")
    print("2. Cancel it from the Kaggle web UI")
    print("3. Try pushing again later")