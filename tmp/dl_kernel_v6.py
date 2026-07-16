"""Download the latest executed kernel output (notebook + logs) from Kaggle."""
import requests
import json
import sys
from pathlib import Path

USERNAME = "alonsoalviraaaa"
SLUG = "visionsetil-mega-training"
TOKEN = "KGAT_47893c54215cc359ba93342189276b23"
OUT_DIR = Path("kaggle/kernel_output_v6")
OUT_DIR.mkdir(parents=True, exist_ok=True)

headers = {"Authorization": f"Bearer {TOKEN}"}

# 1. Get status
print("=" * 60)
print("1. KERNEL STATUS")
print("=" * 60)
resp = requests.get(
    f"https://www.kaggle.com/api/v1/kernels/status",
    params={"userName": USERNAME, "kernelSlug": SLUG},
    headers=headers,
    timeout=30,
)
print(f"Status code: {resp.status_code}")
if resp.status_code == 200:
    status_data = resp.json()
    print(json.dumps(status_data, indent=2))
else:
    print(resp.text[:1000])

# 2. Try to download notebook (pull)
print("\n" + "=" * 60)
print("2. PULL NOTEBOOK")
print("=" * 60)
resp2 = requests.get(
    f"https://www.kaggle.com/api/v1/kernels/pull",
    params={"userName": USERNAME, "kernelSlug": SLUG},
    headers=headers,
    timeout=60,
)
print(f"Status code: {resp2.status_code}")
if resp2.status_code == 200:
    nb_data = resp2.json()
    nb_path = OUT_DIR / "visionsetil_mega_training.ipynb"
    # The response has 'source' as string and 'blob' as json
    if "source" in nb_data:
        source = nb_data["source"]
        if isinstance(source, str):
            nb_path.write_text(source, encoding="utf-8")
        else:
            nb_path.write_text(json.dumps(source, indent=1), encoding="utf-8")
        print(f"Notebook saved to {nb_path} ({nb_path.stat().st_size} bytes)")
    else:
        print(f"Keys: {list(nb_data.keys())}")
        nb_path.write_text(json.dumps(nb_data, indent=1), encoding="utf-8")
else:
    print(resp2.text[:1000])

# 3. Try output download
print("\n" + "=" * 60)
print("3. OUTPUT DOWNLOAD")
print("=" * 60)
resp3 = requests.get(
    f"https://www.kaggle.com/api/v1/kernels/output",
    params={"userName": USERNAME, "kernelSlug": SLUG},
    headers=headers,
    timeout=120,
    stream=True,
)
print(f"Status code: {resp3.status_code}")
if resp3.status_code == 200 and "application/zip" in resp3.headers.get("content-type", ""):
    zip_path = OUT_DIR / "output.zip"
    with open(zip_path, "wb") as f:
        for chunk in resp3.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"Output zip saved to {zip_path} ({zip_path.stat().st_size} bytes)")
else:
    print(f"Content-Type: {resp3.headers.get('content-type', 'unknown')}")
    print(resp3.text[:500] if resp3.status_code != 200 else "No zip content")

print("\nDone.")